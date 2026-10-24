'use strict';

/**
 * 单页内容（关于页、自定义页面）的读写。
 *
 * 与文章的差别：没有草稿/发布/标签，key 即路由（/p/:key），
 * 内容同样以 Markdown 为准、渲染后落 content_html。
 */

const db = require('../db');
const md = require('../utils/markdown');

const KEY_RE = /^[a-z][a-z0-9-]{0,49}$/;

// 这些 key 对应 public/ 下已有的静态页面，不允许被自定义页面覆盖
const RESERVED = ['about', 'index', 'posts', 'guestbook', 'admin', 'media', 'p'];

function isValidKey(key) {
  return KEY_RE.test(String(key || ''));
}

async function list() {
  const rows = await db.query(
    `SELECT page_key, title, updated_at, LENGTH(content_md) AS content_length
       FROM site_pages ORDER BY page_key`
  );

  return rows.map((row) => ({
    key: row.page_key,
    title: row.title,
    updatedAt: row.updated_at,
    contentLength: Number(row.content_length || 0),
  }));
}

async function get(key) {
  const row = await db.queryOne(
    'SELECT page_key, title, content_md, content_html, updated_at FROM site_pages WHERE page_key = ? LIMIT 1',
    [key]
  );
  if (!row) return null;

  return {
    key: row.page_key,
    title: row.title,
    contentMd: row.content_md,
    contentHtml: row.content_html || md.render(row.content_md),
    updatedAt: row.updated_at,
  };
}

/** 前台只拿渲染结果，不暴露 Markdown 原文 */
async function getPublic(key) {
  const page = await get(key);
  if (!page || !String(page.contentMd || '').trim()) return null;

  return {
    key: page.key,
    title: page.title,
    html: page.contentHtml,
    updatedAt: page.updatedAt,
  };
}

async function save(key, { title, contentMd }) {
  const html = md.render(contentMd);

  await db.query(
    `INSERT INTO site_pages (page_key, title, content_md, content_html, updated_at)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), content_md = VALUES(content_md),
       content_html = VALUES(content_html), updated_at = NOW()`,
    [key, title, contentMd, html]
  );

  return get(key);
}

async function remove(key) {
  const result = await db.query('DELETE FROM site_pages WHERE page_key = ?', [key]);
  return result.affectedRows > 0;
}

module.exports = { RESERVED, isValidKey, list, get, getPublic, save, remove };
