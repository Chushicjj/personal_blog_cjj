'use strict';

/**
 * 后台留言管理：
 *   GET    /api/admin/messages             分页 + 关键词搜索
 *   DELETE /api/admin/messages/:id         删除单条
 *   POST   /api/admin/messages/batch-delete 批量删除 { ids: [] }
 *
 * 留言没有软删除字段，这里就是真删；后台 UI 会二次确认。
 */

const express = require('express');

const db = require('../../db');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');
const { pagination } = require('../../utils/validate');

const router = express.Router();

const CONTENT_PREVIEW = 500;

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(CODES.BAD_REQUEST, '留言 id 不合法');
  return id;
}

router.get('/', async (req, res) => {
  const { page, pageSize } = pagination(req.query, { maxPageSize: 50 });
  const keyword = String(req.query.q || '').trim().slice(0, 50);
  const offset = (page - 1) * pageSize;

  const params = [];
  let where = '';

  if (keyword) {
    where = 'WHERE nickname LIKE ? OR content LIKE ?';
    const like = `%${keyword}%`;
    params.push(like, like);
  }

  const countRow = await db.queryOne(`SELECT COUNT(*) AS total FROM guestbook_messages ${where}`, params);
  const rows = await db.query(
    `SELECT id, nickname, content, ip_address, created_at
       FROM guestbook_messages ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const total = Number(countRow ? countRow.total : 0);

  ok(res, {
    list: rows.map((row) => ({
      id: Number(row.id),
      nickname: row.nickname,
      content: String(row.content || '').slice(0, CONTENT_PREVIEW),
      ipAddress: row.ip_address || '',
      createdAt: row.created_at,
    })),
    pagination: { page, pageSize, total, totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
  });
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const result = await db.query('DELETE FROM guestbook_messages WHERE id = ?', [id]);

  if (result.affectedRows === 0) throw new AppError(CODES.NOT_FOUND, '留言不存在或已被删除');

  logger.info('message_deleted', { reqId: req.id, id, adminId: req.admin.id });
  ok(res, { id }, '已删除');
});

router.post('/batch-delete', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const raw = Array.isArray(body.ids) ? body.ids : [];

  const ids = raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);

  if (!ids.length) throw new AppError(CODES.BAD_REQUEST, '请选择要删除的留言');
  if (ids.length > 100) throw new AppError(CODES.BAD_REQUEST, '单次最多删除 100 条');

  const result = await db.query('DELETE FROM guestbook_messages WHERE id IN (?)', [ids]);

  logger.info('messages_batch_deleted', { reqId: req.id, count: result.affectedRows, adminId: req.admin.id });
  ok(res, { deleted: result.affectedRows }, `已删除 ${result.affectedRows} 条留言`);
});

module.exports = router;
