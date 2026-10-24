'use strict';

/**
 * 前台文章接口（只暴露已发布内容）：
 *   GET  /api/articles?tag=&page=&pageSize=
 *   GET  /api/articles/:slug
 *   GET  /api/articles/:slug/comments   评论分页
 *   POST /api/articles/:slug/comments   发表评论
 */

const express = require('express');

const db = require('../db');
const articles = require('../services/articles');
const comments = require('../services/comments');
const throttle = require('../utils/throttle');
const logger = require('../utils/logger');
const { ok, AppError, CODES } = require('../utils/response');
const { text, pagination } = require('../utils/validate');

const router = express.Router();

// 同一 IP 两次评论的最小间隔
const COMMENT_INTERVAL_MS = 15 * 1000;

router.get('/', async (req, res) => {
  const { page, pageSize } = pagination(req.query, { maxPageSize: 20 });
  const category = String(req.query.category || '').trim().slice(0, 50);
  const q = String(req.query.q || '').trim().slice(0, 50);

  const [result, categories] = await Promise.all([
    articles.listPublished({ category, q, page, pageSize }),
    articles.categoryFacets(),
  ]);

  ok(res, {
    list: result.list,
    categories: categories.map((row) => ({
      name: row.name,
      slug: row.slug,
      count: Number(row.count),
    })),
    pagination: {
      page,
      pageSize,
      total: result.total,
      totalPages: pageSize > 0 ? Math.ceil(result.total / pageSize) : 0,
    },
  });
});

/** 评论接口只认「已发布且未删除」的文章 */
async function resolveArticleId(slug) {
  const row = await db.queryOne(
    'SELECT id FROM articles WHERE slug = ? AND status = 1 AND deleted_at IS NULL LIMIT 1',
    [slug]
  );

  if (!row) throw new AppError(CODES.NOT_FOUND, '文章不存在或未发布');
  return Number(row.id);
}

router.get('/:slug/comments', async (req, res) => {
  const articleId = await resolveArticleId(String(req.params.slug || '').slice(0, 200));
  const { page, pageSize, offset } = pagination(req.query, { maxPageSize: 50 });

  const { list, total } = await comments.listByArticle(articleId, { page, pageSize, offset });

  ok(res, {
    list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  });
});

router.post('/:slug/comments', async (req, res) => {
  // 评论必须登录：昵称取账号，不接受前端传值，避免冒名
  if (!req.user) {
    throw new AppError(CODES.UNAUTHORIZED, '请先登录后再评论');
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // 先做便宜的校验，再限流，最后才查库：
  // 校验失败的请求不该吃掉用户的提交配额（否则填错一次要等 15 秒）
  const content = text(body.content, 'content', { max: comments.CONTENT_MAX });

  const ip = (req.ip || '').replace(/^::ffff:/, '').slice(0, 45) || 'unknown';
  const wait = throttle.hit(`comment:${ip}`, COMMENT_INTERVAL_MS);
  if (wait) {
    throw new AppError(CODES.TOO_MANY_REQUESTS, `发得太快了，${wait} 秒后再试`);
  }

  const articleId = await resolveArticleId(String(req.params.slug || '').slice(0, 200));

  const comment = await comments.create(articleId, {
    userId: req.user.id,
    nickname: req.user.nickname,
    content,
    ip,
  });

  logger.info('comment_created', {
    reqId: req.id,
    id: comment.id,
    articleId,
    userId: req.user.id,
    ip,
  });

  ok(res, comment, '评论已发布');
});

router.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 200);
  const article = await articles.findBySlug(slug);

  if (!article) throw new AppError(CODES.NOT_FOUND, '文章不存在或未发布');
  ok(res, article);
});

module.exports = router;
