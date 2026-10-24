'use strict';

/**
 * 图片存储（二进制存 MySQL）。
 *
 * 为什么按 sha256 存：同一张图重复上传只落一份，复制粘贴多次也不会把库撑大；
 * 附带好处是 URL 变成内容寻址（/media/<sha>.<ext>），可以放心发一年期强缓存。
 *
 * 换存储时只需要改这一个文件（例如换成 OSS：save 返回外链、read 直接 302）。
 */

const crypto = require('crypto');

const db = require('../db');
const { AppError, CODES } = require('../utils/response');

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * 进程内读缓存：URL 是内容寻址的（内容变则 sha 变），所以缓存永不过期也安全。
 * 命中时不查库，避免每张图都走一次 MySQL。
 * LRU 策略：Map 迭代序即插入序，命中时挪到末尾；总字节超预算从头逐出。
 */
const CACHE_MAX_BYTES = 64 * 1024 * 1024;
const readCache = new Map(); // key -> { row, bytes }
let cacheBytes = 0;

function cacheGet(key) {
  const entry = readCache.get(key);
  if (!entry) return null;
  readCache.delete(key);
  readCache.set(key, entry);
  return entry.row;
}

function cachePut(key, row) {
  const bytes = row.data.length;
  if (bytes > CACHE_MAX_BYTES / 4) return; // 单图超过预算 1/4 不缓存，避免一张大图挤掉全部
  readCache.set(key, { row, bytes });
  cacheBytes += bytes;
  while (cacheBytes > CACHE_MAX_BYTES && readCache.size > 1) {
    const [oldestKey, oldest] = readCache.entries().next().value;
    readCache.delete(oldestKey);
    cacheBytes -= oldest.bytes;
  }
}

function cacheDrop(key) {
  const entry = readCache.get(key);
  if (entry) {
    readCache.delete(key);
    cacheBytes -= entry.bytes;
  }
}

/** 按文件头判断真实类型：客户端声明的 Content-Type 完全不可信 */
function sniff(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.toString('ascii', 0, 4) === 'GIF8') {
    return { mime: 'image/gif', ext: 'gif' };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', ext: 'avif' };
  }

  // 故意不支持 SVG：SVG 可以内嵌脚本，作为同源资源返回等于开了一个 XSS 口子
  return null;
}

function urlOf(row) {
  return `/media/${row.sha256}.${row.ext}`;
}

function toItem(row) {
  return {
    id: Number(row.id),
    url: urlOf(row),
    mime: row.mime,
    size: Number(row.size),
    originalName: row.original_name || '',
    createdAt: row.created_at,
  };
}

async function save({ buffer, originalName }) {
  if (!buffer || !buffer.length) {
    throw new AppError(CODES.BAD_REQUEST, '没有收到文件');
  }
  if (buffer.length > MAX_BYTES) {
    throw new AppError(CODES.BAD_REQUEST, `图片超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限`);
  }

  const kind = sniff(buffer);
  if (!kind) {
    throw new AppError(CODES.BAD_REQUEST, '只支持 PNG / JPEG / GIF / WebP / AVIF 图片');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await db.queryOne('SELECT * FROM media WHERE sha256 = ? LIMIT 1', [sha256]);
  if (existing) {
    return { item: toItem(existing), duplicate: true };
  }

  const result = await db.query(
    'INSERT INTO media (sha256, mime, ext, size, original_name, data) VALUES (?, ?, ?, ?, ?, ?)',
    [sha256, kind.mime, kind.ext, buffer.length, String(originalName || '').slice(0, 200) || null, buffer]
  );

  const row = await db.queryOne('SELECT * FROM media WHERE id = ? LIMIT 1', [result.insertId]);
  return { item: toItem(row), duplicate: false };
}

async function read(sha256, ext) {
  const key = `${sha256}.${ext || ''}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const row = await db.queryOne('SELECT mime, size, ext, data FROM media WHERE sha256 = ? LIMIT 1', [sha256]);
  if (!row) return null;
  if (ext && row.ext !== ext) return null;

  cachePut(key, row);
  return row;
}

async function list({ page = 1, pageSize = 24 } = {}) {
  const offset = (page - 1) * pageSize;

  const countRow = await db.queryOne('SELECT COUNT(*) AS total, COALESCE(SUM(size), 0) AS bytes FROM media');
  const rows = await db.query(
    `SELECT id, sha256, mime, ext, size, original_name, created_at
       FROM media ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );

  return {
    list: rows.map(toItem),
    total: Number(countRow ? countRow.total : 0),
    bytes: Number(countRow ? countRow.bytes : 0),
  };
}

/** 删除前查引用：正文里出现该 URL 或用作封面，就不让直接删 */
async function usage(media) {
  const url = urlOf(media);
  const row = await db.queryOne(
    `SELECT COUNT(*) AS count FROM articles
      WHERE deleted_at IS NULL AND (content_md LIKE ? OR cover_image = ?)`,
    [`%${url}%`, url]
  );
  return Number(row ? row.count : 0);
}

async function remove(id, { force = false } = {}) {
  const row = await db.queryOne('SELECT * FROM media WHERE id = ? LIMIT 1', [id]);
  if (!row) throw new AppError(CODES.NOT_FOUND, '图片不存在');

  const used = await usage(row);
  if (used > 0 && !force) {
    throw new AppError(CODES.CONFLICT, `该图片正被 ${used} 篇文章引用，确认要删除吗？`, { used });
  }

  await db.query('DELETE FROM media WHERE id = ?', [id]);
  cacheDrop(`${row.sha256}.${row.ext}`);
  return { url: urlOf(row), used };
}

module.exports = { save, read, list, remove, usage, urlOf, MAX_BYTES };
