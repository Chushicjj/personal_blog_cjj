'use strict';

/**
 * 后台视频上传：
 *   POST   /api/admin/videos/upload   multipart，字段名 file
 *   GET    /api/admin/videos          已上传视频列表
 *   DELETE /api/admin/videos?path=... 删除
 *
 * 文件落磁盘（<UPLOAD_DIR>/video/YYYY/MM/），不写数据库。
 */

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const videos = require('../../services/videos');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, videos.TMP),
    // 先落到 tmp，校验文件头后再改名归档
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(8).toString('hex')}.part`),
  }),
  limits: { fileSize: videos.MAX_BYTES, files: 1 },
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(CODES.BAD_REQUEST, `视频超过 ${Math.round(videos.MAX_BYTES / 1024 / 1024)}MB 上限`));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(CODES.BAD_REQUEST, '表单字段名必须是 file'));
    }
    return next(new AppError(CODES.BAD_REQUEST, `上传失败：${err.message}`));
  });
}, async (req, res) => {
  const result = await videos.finalize(req.file && req.file.path, req.file && req.file.originalname);

  logger.info('video_ready', { reqId: req.id, url: result.url, size: result.size, adminId: req.admin.id });
  ok(res, result, '视频已上传');
});

router.get('/', async (req, res) => {
  const list = await videos.list();
  const totalBytes = list.reduce((sum, item) => sum + item.size, 0);

  ok(res, { list, total: list.length, totalBytes });
});

router.delete('/', async (req, res) => {
  const target = String(req.query.path || '');
  await videos.remove(target);

  logger.info('video_deleted', { reqId: req.id, path: target, adminId: req.admin.id });
  ok(res, { path: target }, '已删除');
});

module.exports = router;
