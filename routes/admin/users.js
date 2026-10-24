'use strict';

/**
 * 后台访客账号管理：
 *   GET    /api/admin/users              分页 + 关键词（用户名/昵称）
 *   PATCH  /api/admin/users/:id/status   启用 / 禁用（禁用会立刻踢掉会话）
 *   DELETE /api/admin/users/:id          删号（评论保留，user_id 置空）
 */

const express = require('express');

const users = require('../../services/users');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');
const { pagination } = require('../../utils/validate');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(CODES.BAD_REQUEST, '用户 id 不合法');
  return id;
}

router.get('/', async (req, res) => {
  const { page, pageSize, offset } = pagination(req.query, { maxPageSize: 50 });
  const keyword = String(req.query.q || '').trim().slice(0, 50);

  const { list, total } = await users.list({ page, pageSize, offset, keyword });

  ok(res, {
    list,
    pagination: { page, pageSize, total, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
  });
});

router.patch('/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const status = Number(body.status) === 1 ? 1 : 0;

  const result = await users.setStatus(id, status);

  logger.info('user_status_changed', { reqId: req.id, id, status, adminId: req.admin.id });
  ok(res, result, status ? '已启用' : '已禁用，该用户的登录状态已失效');
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  await users.remove(id);

  logger.info('user_deleted', { reqId: req.id, id, adminId: req.admin.id });
  ok(res, { id }, '已删除账号，其评论保留');
});

module.exports = router;
