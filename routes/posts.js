'use strict';

/**
 * GET /posts/:slug —— 文章页服务端直出。
 *
 * 命中不到就 next()，交给后面的静态资源与 404 处理，
 * 这样旧链接、拼错的 slug 都能正常落到 404 页面。
 */

const express = require('express');

const articles = require('../services/articles');
const comments = require('../services/comments');
const settings = require('../services/settings');
const cookies = require('../utils/cookies');
const { renderPost } = require('../views/post');

const router = express.Router();

// 每页评论条数：首屏由服务端直出，之后由前端「加载更多」补
const COMMENT_PAGE_SIZE = 10;
// 同一篇的阅读计数去重：cookie 里记住最近看过的 id，一天内不重复 +1
const SEEN_COOKIE = 'blog_seen';
const SEEN_LIMIT = 40;

function seenIds(req) {
  const raw = cookies.parse(req.headers.cookie)[SEEN_COOKIE] || '';
  return raw
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

router.get('/:slug', async (req, res, next) => {
  const slug = String(req.params.slug || '').slice(0, 200);

  const article = await articles.findBySlug(slug);
  if (!article) return next();

  // 站点名以后台设置为准；取不到就用模板里的默认值
  const [site, commentData] = await Promise.all([
    settings.getAll().catch(() => null),
    comments.listByArticle(article.id, { page: 1, pageSize: COMMENT_PAGE_SIZE, offset: 0 }),
  ]);

  const seen = seenIds(req);
  if (!seen.includes(article.id)) {
    // 计数失败不影响页面
    articles.bumpView(article.id).catch(() => {});

    const nextSeen = [article.id, ...seen].slice(0, SEEN_LIMIT);
    res.append(
      'Set-Cookie',
      cookies.serialize(SEEN_COOKIE, nextSeen.join(','), { maxAge: 24 * 60 * 60, httpOnly: true, sameSite: 'Lax' })
    );
  }

  // HTML 不缓存：改了文章立刻生效；正文里的图片各自带一年期强缓存
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(renderPost(article, {
    siteName: site && site.siteName,
    comments: commentData.list,
    commentTotal: commentData.total,
    commentPageSize: COMMENT_PAGE_SIZE,
    // 登录状态由服务端直出，避免评论区先闪一下「请登录」再变成输入框
    viewer: req.user || null,
    // og:image 需要绝对地址，分享卡片才会显示封面
    origin: `${req.protocol}://${req.get('host')}`,
  }));
});

module.exports = router;
