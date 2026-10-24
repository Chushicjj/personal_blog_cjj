/**
 * 首页双卡片：取最近两篇已发布文章。
 *
 * 卡片数量固定为 2（版式是左右并排），不足两篇就只渲染已有的，
 * 一篇都没有时保留一个指向文章列表的入口，避免首页出现空白区。
 */
(function (global, document) {
  'use strict';

  var wrap = document.getElementById('features');
  if (!wrap) return;

  var util = global.BlogUtil;
  var esc = util.escapeHtml;
  var TONES = ['feature-card--warm', 'feature-card--cool'];

  function cardHtml(post, index) {
    var date = util.formatDate(post.publishedAt);
    return (
      '<a class="feature-card ' + TONES[index % TONES.length] + '" href="/posts/' + encodeURIComponent(post.slug) + '">' +
        '<h2>' + esc(post.title) + '</h2>' +
        '<p>' + esc(post.summary) + '</p>' +
        '<span class="feature-meta">' + esc(date) + ' · ' + post.viewCount + ' 次阅读 · 约 ' + post.readingMinutes + ' 分钟</span>' +
      '</a>'
    );
  }

  global
    .fetch('/api/articles?pageSize=2', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json();
    })
    .then(function (payload) {
      if (!payload || payload.code !== 0 || !payload.data) return;

      var list = payload.data.list || [];
      if (!list.length) {
        wrap.innerHTML =
          '<a class="feature-card feature-card--warm" href="/posts.html">' +
            '<h2>还没有文章</h2>' +
            '<p>第一篇正在写。</p>' +
            '<span class="feature-meta">查看文章列表 →</span>' +
          '</a>';
        return;
      }

      wrap.innerHTML = list.slice(0, 2).map(cardHtml).join('');
    })
    .catch(function () {
      /* 网络异常时保留 HTML 里的兜底卡片 */
    });
})(window, document);
