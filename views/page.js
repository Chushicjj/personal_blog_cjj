'use strict';

/**
 * 自定义页面的服务端渲染（/p/:key）。
 *
 * 关于页走的是 public/about.html 静态壳 + /api/pages/about 填充，
 * 这里负责「后台新建的其它页面」——它们没有静态壳，必须直出。
 */

const { escapeHtml } = require('../utils/markdown');

const DEFAULT_SITE = 'Blog_j';

function renderPage(page, options) {
  const SITE = (options && options.siteName) || DEFAULT_SITE;
  const title = escapeHtml(page.title);
  const description = escapeHtml(String(page.html || '').replace(/<[^>]+>/g, ' ').slice(0, 120));

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · ${SITE}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#fdfbf7">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="/p/${escapeHtml(page.key)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/article.css">
  <script>
    (function () {
      try {
        var saved = localStorage.getItem('blog-theme');
        var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
    })();
  </script>
</head>
<body>
  <a class="skip-link" href="#main">跳到正文</a>

  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="/"><span class="logo-a" data-author>cjj</span><span class="logo-b" data-site-name>${SITE}</span></a>

      <nav class="top-nav" aria-label="主导航">
        <a href="/" data-nav="home">首页</a>
        <a href="/posts.html" data-nav="posts">文章</a>
        <a href="/guestbook.html" data-nav="guestbook">留言</a>
        <a href="/about.html" data-nav="about">关于</a>
      </nav>

      <div class="header-actions">
        <button class="theme-btn" type="button" id="theme-toggle" aria-pressed="false"><span id="theme-label">深色</span></button>
        <button class="menu-btn" type="button" id="menu-toggle" aria-expanded="false" aria-controls="mobile-menu">菜单</button>
      </div>
    </div>
  </header>

  <div class="mobile-menu" id="mobile-menu">
    <a href="/">首页</a>
    <a href="/posts.html">文章</a>
    <a href="/guestbook.html">留言</a>
    <a href="/about.html">关于</a>
  </div>

  <main class="page" id="main">
    <article class="article">
      <p class="article-kicker">页面</p>

      <header class="article-head">
        <h1>${title}</h1>
      </header>

      <div class="article-body">
${page.html}
      </div>
    </article>
  </main>

  <footer class="site-footer">
    <span>© <span data-year>2026</span> <span data-site-name>${SITE}</span></span>
    <span class="sep">·</span>
    <span>建站于 <span data-since>2024.03</span></span>
    <span class="sep">·</span>
    <span>Node.js · Nginx</span>
    <span class="sep">·</span>
    <a class="footer-link" href="/archive.html">归档</a>
    <a class="footer-link" href="/account.html">账号</a>
    <button class="to-top" id="to-top" type="button" aria-label="回到顶部">↑</button>
  </footer>

  <script src="/assets/js/config.js"></script>
  <script src="/assets/js/settings.js"></script>
  <script src="/assets/js/util.js"></script>
  <script src="/assets/js/shell.js"></script>
</body>
</html>`;
}

module.exports = { renderPage };
