'use strict';

/**
 * 本地上传的视频文件（存磁盘，不入库）。
 *
 * 布局：<UPLOAD_DIR>/video/YYYY/MM/<16位随机名>.<ext>
 * 对外地址：/uploads/video/YYYY/MM/xxx.mp4（由 app.js 的 express.static 提供，
 * 自带 Accept-Ranges，浏览器才能拖动进度条）
 *
 * 与图片的分工：
 *   - 图片 ≤5MB，存 media 表，走内容寻址 + 强缓存；
 *   - 视频几十 MB 级，存磁盘。塞进 LONGBLOB 会撞 max_allowed_packet，
 *     还会让数据库备份从几十 MB 涨到几个 GB。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const env = require('../config/env');
const logger = require('../utils/logger');
const { AppError, CODES } = require('../utils/response');

const ROOT = path.join(env.upload.dir, 'video');
const TMP = path.join(env.upload.dir, 'tmp');

const MAX_BYTES = Math.max(1, env.upload.videoMaxMb) * 1024 * 1024;

// 文件名由本模块生成，不含用户输入；这里再兜一层，杜绝路径穿越
const NAME_RE = /^[a-f0-9]{16}\.(mp4|webm|ogv|ogg|mov|mkv)$/;
const REL_RE = /^video\/\d{4}\/\d{2}\/[a-f0-9]{16}\.(mp4|webm|ogv|ogg|mov|mkv)$/;

function ensureDirs() {
  fs.mkdirSync(TMP, { recursive: true });
  fs.mkdirSync(ROOT, { recursive: true });
}
ensureDirs();

/** 按文件头判断真实类型，客户端给的 MIME 一律不信 */
function sniff(head) {
  if (!head || head.length < 12) return null;

  if (head.toString('ascii', 4, 8) === 'ftyp') {
    const brand = head.toString('ascii', 8, 12);
    if (brand === 'qt  ') return { ext: 'mov', mime: 'video/quicktime' };
    return { ext: 'mp4', mime: 'video/mp4' };
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    // EBML 容器：DocType 里写着 webm 还是 matroska
    const text = head.toString('ascii', 0, Math.min(head.length, 64));
    return text.includes('webm')
      ? { ext: 'webm', mime: 'video/webm' }
      : { ext: 'mkv', mime: 'video/x-matroska' };
  }
  if (head.toString('ascii', 0, 4) === 'OggS') {
    return { ext: 'ogv', mime: 'video/ogg' };
  }
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'AVI ') {
    return null; // AVI 浏览器基本不能直接播，直接拒绝，避免传上来放不了
  }

  return null;
}

function urlOf(relative) {
  return `/uploads/${relative}`;
}

/**
 * 把 multer 的临时文件转正：校验文件头 → 按年月归档 → 返回可访问地址。
 * 任何一步失败都要删掉临时文件，避免 tmp 目录堆积。
 */
async function finalize(tmpPath, originalName) {
  if (!tmpPath) throw new AppError(CODES.BAD_REQUEST, '没有收到文件');

  let handle;
  try {
    handle = await fs.promises.open(tmpPath, 'r');
    const buffer = Buffer.alloc(64);
    const { bytesRead } = await handle.read(buffer, 0, 64, 0);
    const kind = sniff(buffer.subarray(0, bytesRead));

    if (!kind) {
      throw new AppError(CODES.BAD_REQUEST, '只支持 MP4 / WebM / OGV / MOV 视频');
    }

    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(ROOT, year, month);
    await fs.promises.mkdir(dir, { recursive: true });

    const name = `${crypto.randomBytes(8).toString('hex')}.${kind.ext}`;
    const target = path.join(dir, name);
    await fs.promises.rename(tmpPath, target);

    const stat = await fs.promises.stat(target);
    const relative = `video/${year}/${month}/${name}`;

    logger.info('video_uploaded', {
      name,
      size: stat.size,
      originalName: String(originalName || '').slice(0, 120),
    });

    return {
      url: urlOf(relative),
      path: relative,
      size: stat.size,
      mime: kind.mime,
      name,
    };
  } finally {
    if (handle) await handle.close().catch(() => {});
    // rename 成功后 tmpPath 已不存在，unlink 失败可忽略
    await fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function list() {
  const items = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      return; // 目录还不存在
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!NAME_RE.test(entry.name)) continue;

      const stat = await fs.promises.stat(full);
      const relative = path.relative(env.upload.dir, full).split(path.sep).join('/');
      items.push({
        url: urlOf(relative),
        path: relative,
        name: entry.name,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString().slice(0, 19).replace('T', ' '),
      });
    }
  }

  await walk(ROOT);
  items.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  return items;
}

async function remove(relative) {
  // 只接受本模块生成的相对路径，避免 ../../ 之类的穿越
  if (!REL_RE.test(String(relative || ''))) {
    throw new AppError(CODES.BAD_REQUEST, '视频路径不合法');
  }

  const target = path.join(env.upload.dir, relative);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep)) {
    throw new AppError(CODES.BAD_REQUEST, '视频路径不合法');
  }

  try {
    await fs.promises.unlink(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') throw new AppError(CODES.NOT_FOUND, '视频不存在或已被删除');
    throw err;
  }

  return { path: relative };
}

module.exports = { MAX_BYTES, TMP, sniff, finalize, list, remove, urlOf };
