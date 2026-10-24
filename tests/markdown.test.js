'use strict';

/**
 * 渲染管线测试：markdown-it（关 raw HTML）+ sanitize-html 两道关。
 * 这里锁住的 behavior 被编辑器实时预览与线上正文共用，改渲染规则前先跑这个文件。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const md = require('../utils/markdown');

test('基础渲染：标题 / 加粗 / 行内代码 / 链接', () => {
  const html = md.render('## 你好\n\n正文 **加粗** `code` [链接](https://example.com)');
  assert.match(html, /<h2>你好<\/h2>/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  // 外链自动补 target 与 rel
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('XSS：裸 HTML 与脚本被清掉', () => {
  const html = md.render('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
  // 没有真实标签落地（原文被转义成纯文本显示，不可执行）
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('XSS：javascript: 协议的链接不产出可点 href', () => {
  const html = md.render('[点我](javascript:alert(1))');
  assert.doesNotMatch(html, /href="javascript:/);
});

test('@video：B 站链接生成受控 iframe', () => {
  const html = md.render('@video https://www.bilibili.com/video/BV1xx411c7mD');
  assert.match(html, /player\.bilibili\.com\/player\.html\?bvid=BV1xx411c7mD/);
  assert.match(html, /<iframe/);
});

test('@video：YouTube 链接走 nocookie 播放器，可带图注', () => {
  const html = md.render('@video https://youtu.be/abcdefghijk | 演示');
  assert.match(html, /youtube-nocookie\.com\/embed\/abcdefghijk/);
  assert.match(html, /<figcaption>演示<\/figcaption>/);
});

test('@video：mp4 直链与站内上传走原生 video 标签', () => {
  const a = md.render('@video https://cdn.example.com/demo.mp4');
  assert.match(a, /<video controls[^>]*src="https:\/\/cdn\.example\.com\/demo\.mp4"/);
  const b = md.render('@video /uploads/video/2026/10/a1b2c3d4e5f6a7b8.mp4');
  assert.match(b, /src="\/uploads\/video\/2026\/10\/a1b2c3d4e5f6a7b8\.mp4"/);
});

test('@video：其它地址降级为外链，不生成 iframe', () => {
  const html = md.render('@video https://evil.example.com/embed');
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /video-fallback/);
});

test('@video：非法地址（相对路径 / 协议伪装）不输出可执行内容', () => {
  const html = md.render('@video javascript:alert(1)');
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /<video/);
  assert.match(html, /视频地址无效/);
});

test('@video 不独占一行时不解析，原样成文字', () => {
  const html = md.render('请看 @video https://youtu.be/abcdefghijk 这个');
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /@video/);
});

test('代码块：每行包 .line，未知语言按 text 处理且仍转义', () => {
  const html = md.render('```js\nconst a = 1;\nconst b = 2;\n```');
  assert.match(html, /data-lang="js"/);
  // 两行代码 + 结尾换行产生的空行，每行都必须包 .line
  assert.equal((html.match(/<span class="line">/g) || []).length, 3);

  const raw = md.render('```unknownlang\n<b>not bold</b>\n```');
  assert.match(raw, /data-lang="text"/);
  assert.doesNotMatch(raw, /<b>not bold<\/b>/);
  assert.match(raw, /&lt;b&gt;/);
});

test('代码块跨行高亮：多行注释内每行标签闭合', () => {
  const html = md.render('```js\n/* 开始\n注释中间\n结束 */\n```');
  const lines = html.match(/<span class="line">[\s\S]*?<\/span>(?=\n|$)/g) || [];
  assert.equal(lines.length, 3);
  // 第二行（注释中间行）必须以 reopened span 开头，否则配色错乱
  assert.match(lines[1], /<span class="line"><span class="hljs-comment">/);
});

test('图片自动带 lazy/async 属性', () => {
  const html = md.render('![图](/media/abc.png)');
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
});

test('plainText / excerpt / countWords', () => {
  const src = '# 标题\n\n这是正文 **加粗** 部分。```js\ncode\n```\n\n![x](/a.png)';
  const text = md.plainText(src);
  assert.doesNotMatch(text, /[#*`]/);
  assert.doesNotMatch(text, /code/); // 代码块不计入摘要

  const long = '字'.repeat(200);
  const excerpt = md.excerpt(long, 120);
  assert.equal(excerpt.length, 121); // 120 字 + 省略号

  // 中英混排：3 个 CJK + 2 个英文词 = 5
  assert.equal(md.countWords('你好啊 hello world'), 5);
});

test('escapeHtml 覆盖五种字符', () => {
  assert.equal(md.escapeHtml(`<a href="x">&'` ), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
});
