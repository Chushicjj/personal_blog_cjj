'use strict';

/**
 * 文章评论的读写。
 *
 * 与留言板同构（都是纯文本 + 展示端转义），区别是挂在具体文章下：
 * 删文章时 FK 级联把评论一起带走，不会留下孤儿数据。
 */

const db = require('../db');

const NICKNAME_MAX = 20;
const CONTENT_MAX = 500;

function toComment(row) {
  return {
    id: Number(row.id),
    nickname: row.nickname,
    content: row.content,
    createdAt: row.created_at,
  };
}

/** 公开：按文章 id 取一页评论（倒序，最新的在最上面） */
async function listByArticle(articleId, { page, pageSize, offset }) {
  const totalRow = await db.queryOne('SELECT COUNT(*) AS total FROM comments WHERE article_id = ?', [articleId]);
  const rows = await db.query(
    `SELECT id, nickname, content, created_at
       FROM comments
      WHERE article_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [articleId, pageSize, offset]
  );

  const total = Number(totalRow ? totalRow.total : 0);

  return {
    list: rows.map(toComment),
    total,
  };
}

async function countByArticle(articleId) {
  const row = await db.queryOne('SELECT COUNT(*) AS total FROM comments WHERE article_id = ?', [articleId]);
  return Number(row ? row.total : 0);
}

async function create(articleId, { userId, nickname, content, ip }) {
  const result = await db.query(
    'INSERT INTO comments (article_id, user_id, nickname, content, ip_address) VALUES (?, ?, ?, ?, ?)',
    [articleId, userId || null, nickname, content, ip || null]
  );

  const row = await db.queryOne('SELECT id, nickname, content, created_at FROM comments WHERE id = ?', [
    result.insertId,
  ]);

  return toComment(row);
}

/** 后台：跨文章列出，可按昵称/内容关键词过滤 */
async function listAll({ page, pageSize, offset, keyword }) {
  const params = [];
  let where = '';

  if (keyword) {
    where = 'WHERE c.nickname LIKE ? OR c.content LIKE ?';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const totalRow = await db.queryOne(`SELECT COUNT(*) AS total FROM comments c ${where}`, params);
  const rows = await db.query(
    `SELECT c.id, c.article_id, c.user_id, c.nickname, c.content, c.created_at,
            a.title, a.slug, u.username
       FROM comments c
       LEFT JOIN articles a ON a.id = c.article_id
       LEFT JOIN users u ON u.id = c.user_id
       ${where}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    list: rows.map((row) => ({
      id: Number(row.id),
      articleId: Number(row.article_id),
      articleTitle: row.title || '（文章已删除）',
      articleSlug: row.slug || '',
      userId: row.user_id === null ? null : Number(row.user_id),
      username: row.username || '',
      nickname: row.nickname,
      content: row.content,
      ipAddress: row.ip_address || '',
      createdAt: row.created_at,
    })),
    total: Number(totalRow ? totalRow.total : 0),
  };
}

async function remove(id) {
  return (await db.query('DELETE FROM comments WHERE id = ?', [id])).affectedRows > 0;
}

async function removeMany(ids) {
  return (await db.query('DELETE FROM comments WHERE id IN (?)', [ids])).affectedRows;
}

module.exports = {
  NICKNAME_MAX,
  CONTENT_MAX,
  toComment,
  listByArticle,
  countByArticle,
  create,
  listAll,
  remove,
  removeMany,
};
