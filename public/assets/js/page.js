/**
 * 关于页填充：about.html 是静态壳，正文由 /api/pages/about 覆盖。
 *
 * 静态壳里保留了一份原始内容作为兜底——接口挂了或页面还没在后台填过，
 * 访客看到的仍然是完整页面，而不是一片空白。
 */
(function (global, document) {
  'use strict';

  var body = document.getElementById('page-body');
  var titleEl = document.getElementById('page-title');

  if (!body) return;

  global
    .fetch('/api/pages/about', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok || !payload || payload.code !== 0) return null;
        return payload.data;
      });
    })
    .then(function (page) {
      if (!page || !page.html) return;

      body.innerHTML = page.html;

      if (titleEl && page.title) {
        titleEl.textContent = page.title;
        document.title = page.title + ' · 关于';
      }

      // 后台内容里通常是普通链接，不再有 data-social，这里补上外链安全属性
      Array.prototype.forEach.call(body.querySelectorAll('a[href^="http"]'), function (link) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
    })
    .catch(function () {
      /* 静默失败，保留静态兜底内容 */
    });
})(window, document);
