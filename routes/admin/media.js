'use strict';

/**
 * 后台媒体库：
 *   POST   /api/admin/media/upload   multipart，字段名 file
 *   GET    /api/admin/media          分页列表（不含二进制）
 *   DELETE /api/admin/media/:id      删除，被引用时需 ?force=1
 */

const express = require('express');
const multer = require('multer');

const media = require('../../services/media');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');
const { pagination } = require('../../utils/validate');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: media.MAX_BYTES, files: 1 },
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(CODES.BAD_REQUEST, `图片超过 ${Math.round(media.MAX_BYTES / 1024 / 1024)}MB 上限`));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(CODES.BAD_REQUEST, '表单字段名必须是 file'));
    }
    return next(new AppError(CODES.BAD_REQUEST, `上传失败：${err.message}`));
  });
}, async (req, res) => {
  const result = await media.save({
    buffer: req.file && req.file.buffer,
    originalName: req.file && req.file.originalname,
  });

  logger.info('media_uploaded', {
    reqId: req.id,
    id: result.item.id,
    size: result.item.size,
    duplicate: result.duplicate,
    adminId: req.admin.id,
  });

  ok(res, result.item, result.duplicate ? '库中已有同一张图，已直接复用' : '上传成功');
});

router.get('/', async (req, res) => {
  const { page, pageSize } = pagination(req.query, { maxPageSize: 60 });
  const result = await media.list({ page, pageSize: Math.max(pageSize, 12) });

  ok(res, {
    list: result.list,
    bytes: result.bytes,
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: pageSize > 0 ? Math.ceil(result.total / pageSize) : 0,
    },
  });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(CODES.BAD_REQUEST, '图片 id 不合法');
  }

  const force = String(req.query.force || '') === '1';
  const result = await media.remove(id, { force });

  logger.info('media_deleted', { reqId: req.id, id, used: result.used, adminId: req.admin.id });
  ok(res, result, '已删除');
});

module.exports = router;
