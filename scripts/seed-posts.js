'use strict';

/**
 * 把 seed/posts/*.md 导入数据库（幂等：已存在同 slug 的文章默认跳过）。
 *
 *   node scripts/seed-posts.js           # 新增缺失的文章
 *   node scripts/seed-posts.js --force   # 覆盖已存在文章（正文、标题、标签一起重置）
 *
 * 文件头用极简 front-matter，正文就是普通 Markdown：
 *   ---
 *   title: 标题
 *   slug: url-slug
 *   summary: 摘要（留空则自动截取正文）
 *   publishedAt: 2026-10-18 09:00:00
 *   viewCount: 128
 *   tags: Docker, 运维
 *   ---
 */

const fs = require('fs');
const path = require('path');

const db = require('../db');
const md = require('../utils/markdown');
const articles = require('../services/articles');
const env = require('../config/env');

const SEED_DIR = path.join(env.root, 'seed', 'posts');
const force = process.argv.includes('--force');

/** 只解析「key: value」形式的扁平 front-matter，够用且没有依赖 */
function parseFrontMatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };

  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx < 1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  });

  return { meta, body: match[2] };
}

async function importOne(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const { meta, body } = parseFrontMatter(raw);

  const title = (meta.title || '').trim();
  const slug = (meta.slug || '').trim().toLowerCase();
  const tags = (meta.tags || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!title || !slug) {
    console.log(`  跳过 ${path.basename(file)}：缺少 title 或 slug`);
    return;
  }
  if (!body.trim()) {
    console.log(`  跳过 ${slug}：正文为空`);
    return;
  }

  const contentHtml = md.render(body);
  const wordCount = md.countWords(body);
  const summary = (meta.summary || '').trim() || md.excerpt(body, 120);
  const publishedAt = meta.publishedAt || '1970-01-01 00:00:00';
  const viewCount = Number(meta.viewCount) || 0;

  const existing = await db.queryOne('SELECT id FROM articles WHERE slug = ? LIMIT 1', [slug]);

  if (existing && !force) {
    console.log(`  跳过 ${slug}：已存在（加 --force 覆盖）`);
    return;
  }

  let articleId;

  if (existing) {
    await db.query(
      `UPDATE articles
          SET title = ?, summary = ?, content_md = ?, content_html = ?, status = 1,
              word_count = ?, view_count = ?, published_at = ?, deleted_at = NULL, updated_at = NOW()
        WHERE id = ?`,
      [title, summary, body, contentHtml, wordCount, viewCount, publishedAt, existing.id]
    );
    articleId = existing.id;
    console.log(`  更新 ${slug}`);
  } else {
    const result = await db.query(
      `INSERT INTO articles
         (title, slug, summary, content_md, content_html, status, is_top, view_count, word_count,
          published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, NOW())`,
      [title, slug, summary, body, contentHtml, viewCount, wordCount, publishedAt, publishedAt]
    );
    articleId = result.insertId;
    console.log(`  新增 ${slug}`);
  }

  await db.withTransaction(async (tx) => {
    await articles.replaceTags(tx, articleId, tags);
  });
}

async function main() {
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`目录不存在：${SEED_DIR}`);
    return;
  }

  const files = fs
    .readdirSync(SEED_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort();

  if (!files.length) {
    console.log('seed/posts 下没有 .md 文件');
    return;
  }

  console.log(`开始导入 ${files.length} 个文件${force ? '（--force 覆盖模式）' : ''}`);
  for (const name of files) {
    await importOne(path.join(SEED_DIR, name));
  }

  const row = await db.queryOne(
    'SELECT COUNT(*) AS total, SUM(status = 1) AS published FROM articles WHERE deleted_at IS NULL'
  );
  console.log(`\n当前文章：共 ${Number(row.total)} 篇，已发布 ${Number(row.published)} 篇`);
}

main()
  .then(() => db.close())
  .catch(async (err) => {
    console.error('导入失败：', err.code || '', err.message);
    await db.close().catch(() => {});
    process.exit(1);
  });
