'use strict';

/**
 * 文章数据访问层：后台 CRUD 与前台读取共用。
 *
 * 约定：
 *  - content_md 是权威内容，content_html 在每次保存时重渲染（改了渲染规则可批量重建）；
 *  - 删除是软删（deleted_at），后台可追溯，前台一律过滤；
 *  - 列表里的标签用一次 IN 查询补齐，避免 N+1。
 */

const crypto = require('crypto');

const db = require('../db');
const md = require('../utils/markdown');

const FIELDS = [
  'a.id', 'a.title', 'a.slug', 'a.summary', 'a.cover_image', 'a.category_id', 'a.status', 'a.is_top',
  'a.view_count', 'a.word_count', 'a.published_at', 'a.created_at', 'a.updated_at',
].join(', ');

// 前台列表与详情都要带分类名，统一 LEFT JOIN，免得没分类的文章被过滤掉
const CATEGORY_JOIN = 'LEFT JOIN categories c ON c.id = a.category_id';
const CATEGORY_FIELDS = 'c.name AS category_name, c.slug AS category_slug';

function readingMinutes(wordCount) {
  return Math.max(1, Math.round(Number(wordCount || 0) / 350));
}

function toListItem(row) {
  return {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    summary: row.summary || '',
    coverImage: row.cover_image || '',
    status: Number(row.status),
    isTop: Boolean(row.is_top),
    viewCount: Number(row.view_count || 0),
    wordCount: Number(row.word_count || 0),
    readingMinutes: readingMinutes(row.word_count),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: row.category_name
      ? { id: Number(row.category_id), name: row.category_name, slug: row.category_slug }
      : null,
  };
}

/* ------------------------------ 前台读取 ------------------------------ */

async function listPublished({ category = '', q = '', page = 1, pageSize = 10 } = {}) {
  const offset = (page - 1) * pageSize;
  const params = [];
  let where = 'WHERE a.deleted_at IS NULL AND a.status = 1 AND a.published_at IS NOT NULL AND a.published_at <= NOW()';

  // 搜索分两种：词长 ≥2 走 ngram 全文索引（MATCH AGAINST），单字/索引未建回退 LIKE。
  // 单字走 LIKE 是因为 ngram 默认二字切词，单字查询在 BOOLEAN 模式下也没有意义。
  let searchMode = null; // 'ft' | 'like'
  if (q) {
    if (q.replace(/\s+/g, '').length >= 2) {
      searchMode = 'ft';
      where += ' AND MATCH (a.title, a.summary, a.content_md) AGAINST (? IN NATURAL LANGUAGE MODE)';
      params.push(q);
    } else {
      searchMode = 'like';
      where += ' AND (a.title LIKE ? OR a.summary LIKE ? OR a.content_md LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
  }

  if (category) {
    where += ' AND c.slug = ?';
    params.push(category);
  }

  const run = async (whereClause, whereParams) => {
    const countRow = await db.queryOne(`SELECT COUNT(*) AS total FROM articles a ${CATEGORY_JOIN} ${whereClause}`, whereParams);
    const rows = await db.query(
      `SELECT ${FIELDS}, ${CATEGORY_FIELDS} FROM articles a ${CATEGORY_JOIN} ${whereClause}
        ORDER BY a.is_top DESC, a.published_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...whereParams, pageSize, offset]
    );
    return { list: rows.map(toListItem), total: Number(countRow ? countRow.total : 0) };
  };

  try {
    return await run(where, params);
  } catch (err) {
    // 全文索引未建（未跑 sql/fulltext.sql）时自动回退 LIKE，功能可用只是慢
    if (searchMode === 'ft' && err && err.code === 'ER_FT_MATCHING_KEY_NOT_FOUND') {
      const like = `%${q}%`;
      const likeWhere = where.replace(
        ' AND MATCH (a.title, a.summary, a.content_md) AGAINST (? IN NATURAL LANGUAGE MODE)',
        ' AND (a.title LIKE ? OR a.summary LIKE ? OR a.content_md LIKE ?)'
      );
      const likeParams = [like, like, like, ...params.slice(1)];
      return run(likeWhere, likeParams);
    }
    throw err;
  }
}

/** 前台分类筛选条：只列出真正有已发布文章的分类 */
async function categoryFacets() {
  return db.query(
    `SELECT c.id, c.name, c.slug, COUNT(a.id) AS count
       FROM categories c
       JOIN articles a ON a.category_id = c.id
      WHERE a.deleted_at IS NULL AND a.status = 1 AND a.published_at IS NOT NULL AND a.published_at <= NOW()
      GROUP BY c.id, c.name, c.slug, c.sort_order
      ORDER BY c.sort_order, c.id`
  );
}

/** 阅读数 +1：由路由层判断是否算一次有效浏览（同一天同一篇不重复计数） */
async function bumpView(id) {
  await db.query('UPDATE articles SET view_count = view_count + 1 WHERE id = ?', [id]);
}

async function findBySlug(slug) {
  const row = await db.queryOne(
    `SELECT ${FIELDS}, ${CATEGORY_FIELDS}, a.content_md, a.content_html
       FROM articles a
       ${CATEGORY_JOIN}
      WHERE a.slug = ? AND a.deleted_at IS NULL AND a.status = 1
        AND a.published_at IS NOT NULL AND a.published_at <= NOW()
      LIMIT 1`,
    [slug]
  );
  if (!row) return null;

  const [prev, next] = await Promise.all([
    db.queryOne(
      `SELECT title, slug FROM articles
        WHERE deleted_at IS NULL AND status = 1 AND published_at IS NOT NULL AND published_at <= NOW()
          AND (published_at < ? OR (published_at = ? AND id < ?))
        ORDER BY published_at DESC, id DESC LIMIT 1`,
      [row.published_at, row.published_at, row.id]
    ),
    db.queryOne(
      `SELECT title, slug FROM articles
        WHERE deleted_at IS NULL AND status = 1 AND published_at IS NOT NULL AND published_at <= NOW()
          AND (published_at > ? OR (published_at = ? AND id > ?))
        ORDER BY published_at ASC, id ASC LIMIT 1`,
      [row.published_at, row.published_at, row.id]
    ),
  ]);

  return {
    ...toListItem(row),
    contentMd: row.content_md,
    contentHtml: row.content_html || md.render(row.content_md),
    prev: prev ? { title: prev.title, slug: prev.slug } : null,
    next: next ? { title: next.title, slug: next.slug } : null,
  };
}

/* ------------------------------ 后台读取 ------------------------------ */

async function listAdmin({ status = '', keyword = '', page = 1, pageSize = 20 } = {}) {
  const offset = (page - 1) * pageSize;
  const params = [];
  let where = 'WHERE a.deleted_at IS NULL';

  if (status === '0' || status === '1') {
    where += ' AND a.status = ?';
    params.push(Number(status));
  }

  if (keyword) {
    where += ' AND (a.title LIKE ? OR a.summary LIKE ?)';
    const like = `%${keyword}%`;
    params.push(like, like);
  }

  const countRow = await db.queryOne(`SELECT COUNT(*) AS total FROM articles a ${where}`, params);
  const rows = await db.query(
    `SELECT ${FIELDS}, ${CATEGORY_FIELDS} FROM articles a ${CATEGORY_JOIN} ${where}
      ORDER BY a.is_top DESC, COALESCE(a.published_at, a.created_at) DESC, a.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return { list: rows.map(toListItem), total: Number(countRow ? countRow.total : 0) };
}

async function findById(id) {
  const row = await db.queryOne(
    `SELECT ${FIELDS}, a.content_md, a.content_html, a.category_id, a.deleted_at
       FROM articles a WHERE a.id = ? AND a.deleted_at IS NULL LIMIT 1`,
    [id]
  );
  if (!row) return null;

  return {
    ...toListItem(row),
    categoryId: row.category_id ? Number(row.category_id) : null,
    contentMd: row.content_md,
  };
}

/* ------------------------------ 写入 ------------------------------ */

/** 分类名 → URL 用的 slug：纯中文没有天然 slug，用命名空间 + 内容哈希兜底 */
function slugify(name) {
  const ascii = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  if (ascii) return ascii;
  return `c-${crypto.createHash('sha1').update(String(name || '')).digest('hex').slice(0, 12)}`;
}

function prepare(data) {
  const contentHtml = md.render(data.contentMd);
  const wordCount = md.countWords(data.contentMd);
  const summary = (data.summary || '').trim() || md.excerpt(data.contentMd, 120);

  return {
    title: data.title,
    slug: data.slug,
    summary: summary.slice(0, 500),
    coverImage: data.coverImage || null,
    contentMd: data.contentMd,
    contentHtml,
    categoryId: data.categoryId || null,
    status: data.status ? 1 : 0,
    isTop: data.isTop ? 1 : 0,
    wordCount,
    publishAt: normalizePublishAt(data.publishAt),
  };
}

/**
 * 把 <input type="datetime-local"> 的 "2026-10-25T09:30" 归一化成 MySQL 的 DATETIME。
 * 空值返回 null（表示「不指定」，交给数据库取当前时间）。
 */
function normalizePublishAt(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const matched = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!matched) return null;

  return `${matched[1]}-${matched[2]}-${matched[3]} ${matched[4]}:${matched[5]}:${matched[6] || '00'}`;
}

/**
 * 发布时间交给数据库的 NOW()，不要用 Node 的 new Date()。
 *
 * 原因：JS Date 带毫秒，写进 DATETIME（无小数位）会被四舍五入，
 * 可能落到「下一秒」，此时 published_at <= NOW() 判定为尚未发布，
 * 刚点完发布访问文章页会短暂 404。用 NOW() 则与读取端同一个时钟。
 */
const NOW_IF_PUBLISHED = 'IF(? = 1, NOW(), NULL)';
// 指定了时间就用指定的（支持定时发布），否则：发布→当前时间，草稿→保持原值
const PUBLISH_AT_WITH_FALLBACK = 'COALESCE(?, published_at, IF(? = 1, NOW(), NULL))';

async function create(data) {
  const row = prepare(data);

  return db.withTransaction(async (tx) => {
    const result = await tx.query(
      `INSERT INTO articles
         (title, slug, summary, cover_image, content_md, content_html, category_id,
          status, is_top, word_count, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, IF(? = 1, NOW(), NULL)), NOW(), NOW())`,
      [
        row.title, row.slug, row.summary, row.coverImage, row.contentMd, row.contentHtml,
        row.categoryId, row.status, row.isTop, row.wordCount, row.publishAt, row.status,
      ]
    );

    return Number(result.insertId);
  });
}

async function update(id, data) {
  const row = prepare(data);

  await db.withTransaction(async (tx) => {
    const result = await tx.query(
      `UPDATE articles
          SET title = ?, slug = ?, summary = ?, cover_image = ?, content_md = ?, content_html = ?,
              category_id = ?, status = ?, is_top = ?, word_count = ?,
              published_at = ${PUBLISH_AT_WITH_FALLBACK}, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
      [
        row.title, row.slug, row.summary, row.coverImage, row.contentMd, row.contentHtml,
        row.categoryId, row.status, row.isTop, row.wordCount, row.publishAt, row.status, id,
      ]
    );

    // 没有匹配行说明文章已删或不存在，事务里没有后续操作，直接结束即可
    return result.affectedRows > 0;
  });
}

async function setStatus(id, status) {
  const result = await db.query(
    `UPDATE articles
        SET status = ?, published_at = COALESCE(published_at, ${NOW_IF_PUBLISHED}), updated_at = NOW()
      WHERE id = ? AND deleted_at IS NULL`,
    [status ? 1 : 0, status ? 1 : 0, id]
  );
  return result.affectedRows > 0;
}

async function softDelete(id) {
  const result = await db.query('UPDATE articles SET deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  return result.affectedRows > 0;
}

async function stats() {
  const row = await db.queryOne(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 1) AS published,
       SUM(status = 0) AS drafts,
       COALESCE(SUM(view_count), 0) AS views
     FROM articles WHERE deleted_at IS NULL`
  );

  const media = await db.queryOne('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM media');
  const messages = await db.queryOne('SELECT COUNT(*) AS count FROM guestbook_messages');

  return {
    articles: {
      total: Number((row && row.total) || 0),
      published: Number((row && row.published) || 0),
      drafts: Number((row && row.drafts) || 0),
      views: Number((row && row.views) || 0),
    },
    media: {
      count: Number((media && media.count) || 0),
      bytes: Number((media && media.bytes) || 0),
    },
    messages: Number((messages && messages.count) || 0),
  };
}

module.exports = {
  listPublished, categoryFacets, findBySlug,
  listAdmin, findById, create, update, setStatus, softDelete, stats,
  slugify, bumpView,
};
