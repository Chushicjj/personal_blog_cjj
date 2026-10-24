'use strict';

/**
 * GET /api/archive —— 按年月归档，供 /archive.html 渲染。
 *
 * 只返回已发布的文章，字段精简（归档页只需要标题、链接、分类、日期）。
 */

const express = require('express');

const db = require('../db');
const { ok } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  const rows = await db.query(
    `SELECT a.id, a.title, a.slug, a.published_at, c.name AS category_name
       FROM articles a
       LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.deleted_at IS NULL AND a.status = 1 AND a.published_at IS NOT NULL AND a.published_at <= NOW()
      ORDER BY a.published_at DESC, a.id DESC`
  );

  const groups = [];
  const index = new Map();

  rows.forEach((row) => {
    const month = String(row.published_at).slice(0, 7);
    if (!index.has(month)) {
      const [year, mon] = month.split('-');
      const group = { month, label: `${year} 年 ${Number(mon)} 月`, items: [] };
      index.set(month, group);
      groups.push(group);
    }

    index.get(month).items.push({
      title: row.title,
      slug: row.slug,
      category: row.category_name || '',
      date: String(row.published_at).slice(0, 10),
    });
  });

  res.setHeader('Cache-Control', 'no-cache');
  ok(res, { groups, total: rows.length });
});

module.exports = router;
