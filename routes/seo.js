'use strict';

/**
 * 站点地图与 RSS：
 *   GET /sitemap.xml
 *   GET /feed.xml
 *
 * 两者都只包含「已发布且未删除」的文章，链接用请求的真实 origin 拼绝对地址
 * （app.js 已设 trust proxy，反代后 req.protocol 也是对的）。
 */

const express = require('express');

const db = require('../db');
const settings = require('../services/settings');
const pages = require('../services/pages');

const router = express.Router();

function escapeXml(value) {
  return String(value == null ? '' : value).replace(/[<>&'"]/g, (ch) => {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch];
  });
}

function origin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

async function publishedArticles() {
  return db.query(
    `SELECT a.title, a.slug, a.summary, a.published_at, a.updated_at
       FROM articles a
      WHERE a.deleted_at IS NULL AND a.status = 1 AND a.published_at IS NOT NULL AND a.published_at <= NOW()
      ORDER BY a.published_at DESC, a.id DESC`
  );
}

router.get('/sitemap.xml', async (req, res) => {
  const base = origin(req);
  const [articles, pageRows] = await Promise.all([
    publishedArticles(),
    pages.list().catch(() => []),
  ]);

  const urls = [
    { loc: `${base}/`, priority: '1.0' },
    { loc: `${base}/posts.html`, priority: '0.9' },
    { loc: `${base}/archive.html`, priority: '0.6' },
    { loc: `${base}/about.html`, priority: '0.5' },
    { loc: `${base}/guestbook.html`, priority: '0.5' },
  ];

  articles.forEach((item) => {
    urls.push({
      loc: `${base}/posts/${encodeURIComponent(item.slug)}`,
      lastmod: String(item.updated_at || item.published_at).slice(0, 10),
      priority: '0.8',
    });
  });

  pageRows
    .filter((item) => item.key !== 'about')
    .forEach((item) => {
      urls.push({ loc: `${base}/p/${encodeURIComponent(item.key)}`, priority: '0.4' });
    });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((item) => {
    const lastmod = item.lastmod ? `\n    <lastmod>${item.lastmod}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(item.loc)}</loc>${lastmod}\n    <priority>${item.priority}</priority>\n  </url>`;
  })
  .join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(body);
});

router.get('/feed.xml', async (req, res) => {
  const base = origin(req);
  const [articles, config] = await Promise.all([publishedArticles(), settings.getAll().catch(() => ({}))]);

  const siteName = config.siteName || 'Blog_j';
  const items = articles.slice(0, 20).map((item) => {
    const link = `${base}/posts/${encodeURIComponent(item.slug)}`;
    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <description>${escapeXml(item.summary || '')}</description>
      <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>
    </item>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(siteName)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(config.tagline || siteName)}</description>
    <language>zh-CN</language>
${items.join('\n')}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(body);
});

module.exports = router;
