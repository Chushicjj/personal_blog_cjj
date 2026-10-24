/**
 * 归档页：按年月分组列出全部已发布文章。
 */
(function (global, document) {
  'use strict';

  var wrap = document.getElementById('archive-list');
  var countEl = document.getElementById('archive-count');
  if (!wrap) return;

  var util = global.BlogUtil;
  var esc = util.escapeHtml;

  function groupHtml(group) {
    var items = group.items
      .map(function (item) {
        return (
          '<li class="archive-item">' +
            '<a href="/posts/' + encodeURIComponent(item.slug) + '">' +
              '<time class="archive-date" datetime="' + esc(item.date) + '">' + esc(item.date.slice(5)) + '</time>' +
              '<span class="archive-title">' + esc(item.title) + '</span>' +
              (item.category ? '<span class="archive-cat">' + esc(item.category) + '</span>' : '') +
            '</a>' +
          '</li>'
        );
      })
      .join('');

    return (
      '<section class="archive-group">' +
        '<h2 class="archive-month">' + esc(group.label) +
          '<span class="archive-num">' + group.items.length + ' 篇</span>' +
        '</h2>' +
        '<ul class="archive-items">' + items + '</ul>' +
      '</section>'
    );
  }

  global
    .fetch('/api/archive', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok || !payload || payload.code !== 0) {
          throw new Error((payload && payload.message) || '加载失败');
        }
        return payload.data;
      });
    })
    .then(function (data) {
      var groups = data.groups || [];

      if (!groups.length) {
        util.showState(wrap, { title: '还没有文章', message: '写第一篇之后就这里就会出现。' });
        countEl.textContent = '';
        return;
      }

      countEl.textContent = '共 ' + data.total + ' 篇 · 按时间倒序';
      wrap.innerHTML = groups.map(groupHtml).join('');
    })
    .catch(function (err) {
      util.showState(wrap, {
        title: '归档加载失败',
        message: err.message,
        retry: function () {
          global.location.reload();
        },
      });
      countEl.textContent = '';
    });
})(window, document);
