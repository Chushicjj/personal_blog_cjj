'use strict';

/**
 * 文章页服务端渲染。
 *
 * 为什么不交给前端 JS 拼：文章页是搜索引擎和分享卡片的主要入口，
 * 服务端直出 HTML 才能保证抓取到的正文、标题、description 完整。
 * 模板结构与删掉的静态页保持一致，article.css 一行没改。
 */

const { escapeHtml } = require('../utils/markdown');

const DEFAULT_SITE = 'Blog_j';

function metaLine(article) {
  const date = String(article.publishedAt || article.createdAt || '').slice(0, 10);
  return [
    date ? `<time datetime="${escapeHtml(date)}">${escapeHtml(date)}</time>` : '',
    `<span class="dot">·</span><span>${article.viewCount} 次阅读</span>`,
    `<span class="dot">·</span><span>约 ${article.readingMinutes} 分钟</span>`,
  ]
    .filter(Boolean)
    .join('\n          ');
}

function coverBlock(url) {
  if (!url) return '';
  return `<figure class="article-cover"><img src="${escapeHtml(url)}" alt="" loading="eager" decoding="async"></figure>`;
}

function navBlock(prev, next) {
  const prevHtml = prev
    ? `<a class="prev" href="/posts/${encodeURIComponent(prev.slug)}"><span class="label">上一篇</span><span class="title">${escapeHtml(prev.title)}</span></a>`
    : '<span></span>';

  const nextHtml = next
    ? `<a class="next" href="/posts/${encodeURIComponent(next.slug)}"><span class="label">下一篇</span><span class="title">${escapeHtml(next.title)}</span></a>`
    : '<span></span>';

  return `<nav class="post-nav" aria-label="上一篇与下一篇">
      ${prevHtml}
      ${nextHtml}
      </nav>`;
}

function formatTime(value) {
  return String(value || '').slice(0, 16);
}

function commentItem(comment) {
  return `<li class="comment" data-id="${Number(comment.id)}">
          <div class="comment-head">
            <span class="comment-name">${escapeHtml(comment.nickname)}</span>
            <time class="comment-time">${escapeHtml(formatTime(comment.createdAt))}</time>
          </div>
          <p class="comment-text">${escapeHtml(comment.content)}</p>
        </li>`;
}

function commentFormBlock(options) {
  const viewer = options && options.viewer;

  // 未登录：只给一个入口，不渲染输入框
  if (!viewer) {
    return `<div class="comment-login">
          <p>登录后才能发表评论。</p>
          <a class="btn" href="/account.html">登录 / 注册</a>
        </div>`;
  }

  return `<form class="comment-form" id="comment-form" novalidate>
          <p class="comment-form-label">以 <strong>${escapeHtml(viewer.nickname)}</strong> 的身份评论</p>
          <textarea class="textarea" id="comment-content" name="content" rows="4" maxlength="500" placeholder="说点什么…" required></textarea>
          <div class="comment-form-foot">
            <span class="form-note" id="comment-note" aria-live="polite"></span>
            <button class="btn btn-primary" type="submit" id="comment-submit">发表评论</button>
          </div>
        </form>`;
}

function commentsBlock(article, options) {
  const list = (options && options.comments) || [];
  const total = options && typeof options.commentTotal === 'number' ? options.commentTotal : list.length;
  const pageSize = (options && options.commentPageSize) || 10;

  return `<section class="comments" id="comments" data-slug="${escapeHtml(article.slug)}" data-page-size="${pageSize}">
        <div class="comments-head">
          <h2>评论</h2>
          <span class="comments-count" id="comment-count">${total}</span>
        </div>

        <ol class="comment-list" id="comment-list">
${list.map(commentItem).join('\n')}
        </ol>

        <p class="comments-empty" id="comment-empty"${total > 0 ? ' hidden' : ''}>还没有评论，来说第一句。</p>

        <button class="btn" id="comment-more" type="button"${total > pageSize ? '' : ' hidden'}>加载更多评论</button>

${commentFormBlock(options)}
      </section>`;
}

/**
 * 给正文的 h2/h3 加锚点 id，并抽出目录。
 * 只用二分/三分标题，太少（<3 条）就不显示目录，避免短文顶上挂个孤零零的框。
 */
function buildToc(html) {
  const items = [];

  const withIds = String(html || '').replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (match, level, attrs, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    if (!label) return match;

    const id = `sec-${items.length + 1}`;
    items.push({ level: Number(level), label, id });
    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
  });

  return { html: withIds, items };
}

function tocNav(items) {
  if (items.length < 3) return '';

  const links = items
    .map((item) => `      <li class="toc-lv${item.level}"><a href="#${item.id}">${escapeHtml(item.label)}</a></li>`)
    .join('\n');

  return `<nav class="article-toc" aria-label="本文目录">
      <p class="toc-title">目录</p>
      <ol>
${links}
      </ol>
    </nav>`;
}

function renderPost(article, options) {
  // 站点名来自后台设置，取不到时退回默认值，保证标题永远有内容
  const SITE = (options && options.siteName) || DEFAULT_SITE;
  const title = escapeHtml(article.title);
  const description = escapeHtml(article.summary || '');

  const category = article.category;
  const categoryHtml = category
    ? `<span class="kicker-sep">/</span><a href="/posts.html?category=${encodeURIComponent(category.slug)}">${escapeHtml(category.name)}</a>`
    : '';

  const toc = buildToc(article.contentHtml);

  // 分享卡片必须有绝对地址，相对路径的 og:image 微信/推特都不认
  const origin = (options && options.origin) || '';
  const coverUrl = article.coverImage ? `${origin}${article.coverImage}` : '';
  const ogImage = coverUrl
    ? `  <meta property="og:image" content="${escapeHtml(coverUrl)}">
  <meta name="twitter:card" content="summary_large_image">
`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · ${SITE}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#fdfbf7">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="/posts/${escapeHtml(article.slug)}">
${ogImage}  <link rel="canonical" href="/posts/${escapeHtml(article.slug)}">
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
        <a href="/posts.html" data-nav="posts" aria-current="page">文章</a>
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
      <p class="article-kicker"><a href="/posts.html">← 文章</a>${categoryHtml}</p>

      <header class="article-head">
        <h1>${title}</h1>
        <div class="article-meta">
          ${metaLine(article)}
        </div>
      </header>

${tocNav(toc.items)}

      <div class="article-body">
${coverBlock(article.coverImage)}
${toc.html}
      </div>

      ${navBlock(article.prev, article.next)}

${commentsBlock(article, options)}
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
  <script src="/assets/js/comments.js"></script>
  <script src="/assets/js/shell.js"></script>
</body>
</html>`;
}

module.exports = { renderPost };
