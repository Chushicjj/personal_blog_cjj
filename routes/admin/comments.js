'use strict';

/**
 * 后台文章评论管理：
 *   GET    /api/admin/comments             分页 + 关键词搜索（昵称/内容）
 *   DELETE /api/admin/comments/:id         删除单条
 *   POST   /api/admin/comments/batch-delete 批量删除 { ids: [] }
 */

const express = require('express');

const comments = require('../../services/comments');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');
const { pagination } = require('../../utils/validate');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(CODES.BAD_REQUEST, '评论 id 不合法');
  return id;
}

router.get('/', async (req, res) => {
  const { page, pageSize, offset } = pagination(req.query, { maxPageSize: 50 });
  const keyword = String(req.query.q || '').trim().slice(0, 50);

  const { list, total } = await comments.listAll({ page, pageSize, offset, keyword });

  ok(res, {
    list,
    pagination: { page, pageSize, total, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
  });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const removed = await comments.remove(id);

  if (!removed) throw new AppError(CODES.NOT_FOUND, '评论不存在或已被删除');

  logger.info('comment_deleted', { reqId: req.id, id, adminId: req.admin.id });
  ok(res, { id }, '已删除');
});

router.post('/batch-delete', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!ids.length) throw new AppError(CODES.BAD_REQUEST, '请选择要删除的评论');
  if (ids.length > 100) throw new AppError(CODES.BAD_REQUEST, '单次最多删除 100 条');

  const deleted = await comments.removeMany(ids);

  logger.info('comments_batch_deleted', { reqId: req.id, count: deleted, adminId: req.admin.id });
  ok(res, { deleted }, `已删除 ${deleted} 条评论`);
});

module.exports = router;
