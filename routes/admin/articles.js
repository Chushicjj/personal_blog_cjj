'use strict';

/**
 * 后台文章管理：
 *   GET    /api/admin/articles            列表（状态 / 关键词 / 分页）
 *   GET    /api/admin/articles/:id        单篇（含 Markdown 原文）
 *   POST   /api/admin/articles            新建
 *   PUT    /api/admin/articles/:id        编辑
 *   PATCH  /api/admin/articles/:id/status 草稿 ⇄ 发布
 *   DELETE /api/admin/articles/:id        软删除
 *   POST   /api/admin/articles/rebuild    按当前渲染规则重建全部 HTML
 */

const express = require('express');

const db = require('../../db');
const articles = require('../../services/articles');
const logger = require('../../utils/logger');
const md = require('../../utils/markdown');
const { ok, AppError, CODES } = require('../../utils/response');
const { text, pagination } = require('../../utils/validate');

const router = express.Router();

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function normalizeSlug(input, title) {
  const raw = String(input || '').trim().toLowerCase();
  if (raw) {
    if (!SLUG_RE.test(raw) || raw.length > 200) {
      throw new AppError(CODES.BAD_REQUEST, 'slug 只能包含小写字母、数字和短横线，且不能以短横线开头');
    }
    return raw;
  }

  // 中文标题没有天然 slug，回退到时间戳，作者可在表单里自己填
  const auto = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return auto || `post-${Date.now().toString(36)}`;
}

function readPayload(body) {
  const source = body && typeof body === 'object' ? body : {};

  const title = text(source.title, 'title', { max: 200 });
  const contentMd = text(source.contentMd, 'contentMd', { max: 200000 });
  const summary = text(source.summary, 'summary', { required: false, max: 500 });

  const categoryId = Number(source.categoryId);
  const status = Number(source.status) === 1 ? 1 : 0;

  // datetime-local 给的是 "2026-10-25T09:30"，允许带秒；空值表示「发布时取当前时间」
  const publishAtRaw = String(source.publishAt || '').trim();
  if (publishAtRaw && !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(publishAtRaw)) {
    throw new AppError(CODES.BAD_REQUEST, '发布时间格式不正确，应为 YYYY-MM-DD HH:mm');
  }

  return {
    title,
    slug: normalizeSlug(source.slug, title),
    summary,
    contentMd,
    coverImage: source.coverImage ? String(source.coverImage).slice(0, 255) : null,
    categoryId: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null,
    status,
    isTop: source.isTop === true || Number(source.isTop) === 1 ? 1 : 0,
    publishAt: publishAtRaw || null,
  };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(CODES.BAD_REQUEST, '文章 id 不合法');
  }
  return id;
}

router.get('/', async (req, res) => {
  const { page, pageSize } = pagination(req.query, { maxPageSize: 50 });
  const status = req.query.status === undefined ? '' : String(req.query.status);
  const keyword = String(req.query.q || '').trim().slice(0, 60);

  const result = await articles.listAdmin({ status, keyword, page, pageSize });

  ok(res, {
    list: result.list,
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: pageSize > 0 ? Math.ceil(result.total / pageSize) : 0,
    },
  });
});

router.get('/:id', async (req, res) => {
  const article = await articles.findById(parseId(req.params.id));
  if (!article) throw new AppError(CODES.NOT_FOUND, '文章不存在或已删除');
  ok(res, article);
});

router.post('/', async (req, res) => {
  const payload = readPayload(req.body);

  try {
    const id = await articles.create(payload);
    logger.info('article_created', { reqId: req.id, id, adminId: req.admin.id, slug: payload.slug });
    ok(res, { id, slug: payload.slug }, payload.status ? '文章已发布' : '草稿已保存');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(CODES.CONFLICT, `slug「${payload.slug}」已被占用，换一个`);
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const payload = readPayload(req.body);

  const existing = await articles.findById(id);
  if (!existing) throw new AppError(CODES.NOT_FOUND, '文章不存在或已删除');

  try {
    await articles.update(id, payload);
    logger.info('article_updated', { reqId: req.id, id, adminId: req.admin.id, slug: payload.slug });
    ok(res, { id, slug: payload.slug }, payload.status ? '已保存并发布' : '已保存为草稿');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(CODES.CONFLICT, `slug「${payload.slug}」已被占用，换一个`);
    }
    throw err;
  }
});

router.patch('/:id/status', async (req, res) => {
  const id = parseId(req.params.id);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const status = Number(body.status) === 1 ? 1 : 0;

  const changed = await articles.setStatus(id, status);
  if (!changed) throw new AppError(CODES.NOT_FOUND, '文章不存在或已删除');

  logger.info('article_status_changed', { reqId: req.id, id, status, adminId: req.admin.id });
  ok(res, { id, status }, status ? '已发布' : '已转为草稿');
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);

  const changed = await articles.softDelete(id);
  if (!changed) throw new AppError(CODES.NOT_FOUND, '文章不存在或已删除');

  logger.info('article_deleted', { reqId: req.id, id, adminId: req.admin.id });
  ok(res, { id }, '已删除（可在库中恢复）');
});

/** 编辑器实时预览：走与正式发布完全相同的渲染管线，避免「预览和上线不一致」 */
router.post('/preview', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const contentMd = String(body.contentMd || '').slice(0, 200000);

  ok(res, {
    html: md.render(contentMd),
    wordCount: md.countWords(contentMd),
    readingMinutes: md.readingMinutes(contentMd),
  });
});

/** 改了渲染规则（比如换高亮主题）后，按 content_md 重刷所有 content_html */
router.post('/rebuild', async (req, res) => {
  const rows = await db.query('SELECT id, content_md FROM articles WHERE deleted_at IS NULL');
  let updated = 0;

  for (const row of rows) {
    await db.query('UPDATE articles SET content_html = ?, updated_at = updated_at WHERE id = ?', [
      md.render(row.content_md),
      row.id,
    ]);
    updated += 1;
  }

  logger.info('articles_rebuilt', { reqId: req.id, count: updated, adminId: req.admin.id });
  ok(res, { updated }, `已重建 ${updated} 篇文章的 HTML`);
});

module.exports = router;
