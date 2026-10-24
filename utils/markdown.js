'use strict';

/**
 * Markdown → 文章页 HTML。
 *
 * 产物刻意对齐 public/assets/css/article.css 已有的结构：
 *   - 代码块输出 .code-block > .code-head + pre.code-pre > code.hljs > span.line
 *     （行号由 CSS 的 counter 生成，所以每行必须包一个 .line）
 *   - 图片带 loading="lazy"，其余交给 .article-body img
 *
 * 安全策略：markdown-it 关闭 raw HTML，渲染完再过一遍 sanitize-html。
 * 两道关：即使以后有人改了 html:true，也不会把 <script> 放进正文。
 */

const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js/lib/common');
const sanitizeHtml = require('sanitize-html');

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (ch) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}

/**
 * 把整段高亮结果按行切开，同时保证跨行的标签在每行内闭合。
 *
 * highlight.js 遇到多行注释 / 多行字符串时，<span> 会跨过 \n；
 * 直接 split('\n') 会切出残缺标签，导致后续行配色错乱。
 * 这里维护一个开标签栈：换行时先补齐 </tag>，下一行开头再把标签原样打开。
 */
function splitLines(html) {
  const lines = [];
  const stack = [];
  let buf = '';
  let i = 0;

  function closing() {
    return stack
      .slice()
      .reverse()
      .map((item) => `</${item.name}>`)
      .join('');
  }

  function opening() {
    return stack.map((item) => item.html).join('');
  }

  function appendText(text) {
    const parts = text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) {
        buf += closing();
        lines.push(buf);
        buf = opening();
      }
      buf += part;
    });
  }

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      appendText(html.slice(i));
      break;
    }
    if (lt > i) appendText(html.slice(i, lt));

    const gt = html.indexOf('>', lt);
    if (gt === -1) {
      appendText(html.slice(lt));
      break;
    }

    const tag = html.slice(lt, gt + 1);
    buf += tag;

    if (/^<\//.test(tag)) {
      stack.pop();
    } else if (!/\/>$/.test(tag)) {
      const name = tag.match(/^<([a-zA-Z0-9-]+)/);
      if (name && !['br', 'hr', 'img', 'input'].includes(name[1].toLowerCase())) {
        stack.push({ name: name[1], html: tag });
      }
    }

    i = gt + 1;
  }

  lines.push(buf);
  return lines.length ? lines : [''];
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

/* ------------------------------ 视频 ------------------------------ */

const VIDEO_FILE_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i;

/**
 * 渲染 @video 指令。
 *
 *   @video https://www.bilibili.com/video/BV1xx411c7mD
 *   @video https://youtu.be/xxxxxxxxxxx | 手机录的一段演示
 *   @video https://cdn.example.com/demo.mp4
 *
 * 只有 B 站 / YouTube 会生成 iframe，其余地址走原生 <video> 或降级成链接，
 * 这样正文里不可能被塞进任意站点的 iframe。
 */
function renderVideo(rawUrl, caption) {
  const url = String(rawUrl || '').trim();
  // 既接受外链，也接受本站 /uploads/ 下的本地上传
  const isLocal = /^\/uploads\/[\w./-]+$/.test(url);
  const isRemote = /^https?:\/\//i.test(url);

  if (!isLocal && !isRemote) {
    return `<p class="video-fallback">视频地址无效：${escapeHtml(url)}</p>`;
  }

  const safe = escapeHtml(url);
  const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';

  const bili = /bilibili\.com\/video\/((?:BV[0-9A-Za-z]+)|(?:av\d+))/i.exec(url);
  if (bili) {
    const id = bili[1];
    const query = /^av/i.test(id) ? `aid=${id.slice(2)}` : `bvid=${id}`;
    const src = escapeHtml(`https://player.bilibili.com/player.html?${query}&page=1&high_quality=1&danmaku=0`);
    return (
      `<figure class="video-block"><div class="video-embed">` +
      `<iframe src="${src}" title="Bilibili 视频" loading="lazy" scrolling="no" ` +
      `frameborder="0" allowfullscreen="allowfullscreen" referrerpolicy="no-referrer"></iframe>` +
      `</div>${cap}</figure>`
    );
  }

  const youtube = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/i.exec(url);
  if (youtube) {
    const src = escapeHtml(`https://www.youtube-nocookie.com/embed/${youtube[1]}`);
    return (
      `<figure class="video-block"><div class="video-embed">` +
      `<iframe src="${src}" title="YouTube 视频" loading="lazy" scrolling="no" ` +
      `frameborder="0" allowfullscreen="allowfullscreen" referrerpolicy="no-referrer"></iframe>` +
      `</div>${cap}</figure>`
    );
  }

  if (VIDEO_FILE_RE.test(url)) {
    return `<figure class="video-block"><video controls preload="metadata" playsinline src="${safe}"></video>${cap}</figure>`;
  }

  return `<figure class="video-block"><p class="video-fallback"><a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a></p>${cap}</figure>`;
}

// 把独占一行的 @video 变成块级 token；放在 paragraph 之前，优先匹配
md.block.ruler.before('paragraph', 'video', function videoRule(state, startLine, endLine, silent) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const line = state.src.slice(start, max).trim();

  const matched = /^@video\s+(\S+)(?:\s*\|\s*(.*))?$/.exec(line);
  if (!matched) return false;
  if (silent) return true;

  const token = state.push('video', '', 0);
  token.meta = { url: matched[1], caption: (matched[2] || '').trim() };
  token.block = true;

  state.line = startLine + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

md.renderer.rules.video = (tokens, idx) => {
  const meta = tokens[idx].meta || {};
  return `${renderVideo(meta.url, meta.caption)}\n`;
};

md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const info = String(token.info || '').trim().split(/\s+/)[0];
  const lang = info && hljs.getLanguage(info) ? info : '';

  let highlighted;
  if (lang) {
    highlighted = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value;
  } else {
    highlighted = escapeHtml(token.content);
  }

  const body = splitLines(highlighted)
    .map((line) => `<span class="line">${line}</span>`)
    .join('\n');

  return (
    `<div class="code-block" data-lang="${escapeHtml(lang || 'text')}">` +
    `<div class="code-head"><span class="code-lang">${escapeHtml(lang || 'text')}</span></div>` +
    `<pre class="code-pre"><code class="hljs">${body}</code></pre>` +
    `</div>\n`
  );
};

const defaultImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('loading', 'lazy');
  tokens[idx].attrSet('decoding', 'async');
  return defaultImage(tokens, idx, options, env, self);
};

const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || '';
  if (/^https?:/i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const SANITIZE = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'del', 's', 'blockquote', 'ul', 'ol', 'li',
    'a', 'img', 'code', 'pre', 'span', 'div', 'table', 'thead', 'tbody',
    'tr', 'th', 'td', 'sup', 'sub', 'figure', 'figcaption',
    // 视频：iframe 只可能来自本文件的 renderVideo（Markdown 原文里的裸 HTML 已被转义）
    'iframe', 'video', 'source',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'loading', 'decoding', 'width', 'height'],
    pre: ['class'],
    code: ['class'],
    span: ['class'],
    p: ['class'],
    div: ['class', 'data-lang'],
    figure: ['class'],
    th: ['align'],
    td: ['align'],
    iframe: ['src', 'title', 'loading', 'scrolling', 'frameborder', 'allowfullscreen', 'referrerpolicy', 'allow', 'width', 'height'],
    video: ['src', 'controls', 'preload', 'playsinline', 'poster', 'loop', 'muted', 'width', 'height'],
    source: ['src', 'type'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: {
    img: ['http', 'https', 'data'],
    iframe: ['http', 'https'],
    video: ['http', 'https'],
    source: ['http', 'https'],
  },
  allowProtocolRelative: false,
};

function render(markdown) {
  const raw = md.render(String(markdown || ''));
  return sanitizeHtml(raw, SANITIZE);
}

/** 去掉标记，得到纯文本（用于自动摘要与字数统计） */
function plainText(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~>#|]/g, '')
    .replace(/^\s{0,3}[-+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 摘要：优先用调用方给的 summary，否则截正文前 N 个字 */
function excerpt(markdown, length = 120) {
  const text = plainText(markdown);
  if (text.length <= length) return text;
  return `${text.slice(0, length).trim()}…`;
}

/** 中英混排字数：中日韩字符按字计，其余按词计 */
function countWords(markdown) {
  const text = plainText(markdown);
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g) || []).length;
  const words = (text.replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, ' ').match(/[a-zA-Z0-9_]+/g) || []).length;
  return cjk + words;
}

function readingMinutes(markdown) {
  return Math.max(1, Math.round(countWords(markdown) / 350));
}

module.exports = { render, excerpt, plainText, countWords, readingMinutes, escapeHtml };
