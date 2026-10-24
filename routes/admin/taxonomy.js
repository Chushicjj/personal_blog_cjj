'use strict';

/**
 * 分类维护：列表 / 新建 / 改名 / 删除。
 * 标签已从产品中移除（与分类语义重合），相关表保留在库里但不再写入。
 */

const express = require('express');

const db = require('../../db');
const articles = require('../../services/articles');
const { AppError, CODES, ok } = require('../../utils/response');
const { text } = require('../../utils/validate');

const router = express.Router();

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(CODES.BAD_REQUEST, 'id 不合法');
  return id;
}

router.get('/', async (req, res) => {
  const categories = await db.query(
    `SELECT c.id, c.name, c.slug, c.description, c.sort_order,
            (SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.deleted_at IS NULL) AS count
       FROM categories c ORDER BY c.sort_order, c.id`
  );

  ok(res, {
    categories: categories.map((row) => ({ ...row, id: Number(row.id), count: Number(row.count) })),
  });
});

router.post('/categories', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = text(body.name, 'name', { max: 50 });
  const description = text(body.description, 'description', { required: false, max: 200 });

  try {
    const result = await db.query('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)', [
      name,
      articles.slugify(name),
      description || null,
    ]);
    ok(res, { id: Number(result.insertId), name }, '分类已创建');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(CODES.CONFLICT, '分类名或 slug 已存在');
    throw err;
  }
});

router.patch('/categories/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const name = text(body.name, 'name', { max: 50 });
  const description = text(body.description, 'description', { required: false, max: 200 });

  try {
    const result = await db.query('UPDATE categories SET name = ?, description = ? WHERE id = ?', [
      name,
      description || null,
      id,
    ]);
    if (result.affectedRows === 0) throw new AppError(CODES.NOT_FOUND, '分类不存在');
    ok(res, { id, name }, '已更新');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(CODES.CONFLICT, '分类名已存在');
    throw err;
  }
});

router.delete('/categories/:id', async (req, res) => {
  // 外键是 ON DELETE SET NULL，删分类不会连带删文章
  const result = await db.query('DELETE FROM categories WHERE id = ?', [parseId(req.params.id)]);
  if (result.affectedRows === 0) throw new AppError(CODES.NOT_FOUND, '分类不存在');
  ok(res, null, '已删除，相关文章转为未分类');
});


module.exports = router;
