/**
 * 文章列表页：分类筛选 + 关键词搜索 + 分页加载。
 *
 * 数据来自 /api/articles，三个条件（分类 / 搜索 / 分页）都走服务端，
 * 前端只负责把状态同步到地址栏，方便分享和刷新还原。
 */
(function (global, document) {
  'use strict';

  var util = global.BlogUtil;
  var esc = util.escapeHtml;

  var listWrap = document.getElementById('post-list');
  var categoriesWrap = document.getElementById('posts-categories');
  var categoryRow = document.getElementById('category-row');
  var searchEl = document.getElementById('posts-search');
  var countEl = document.getElementById('posts-count');
  var emptyEl = document.getElementById('posts-empty');
  var moreWrap = document.getElementById('posts-more');
  var moreBtn = document.getElementById('posts-load-more');

  if (!listWrap) return;

  var PAGE_SIZE = 10;
  var state = {
    category: util.qs('category') || '',
    q: util.qs('q') || '',
    page: 0,
    totalPages: 0,
    total: 0,
    loading: false,
  };

  if (searchEl && state.q) searchEl.value = state.q;

  function cardHtml(post) {
    var date = util.formatDate(post.publishedAt);
    var category = post.category
      ? '<span>' + esc(post.category.name) + '</span><span class="sep">·</span>'
      : '';

    return (
      '<a class="post-card" href="/posts/' + encodeURIComponent(post.slug) + '">' +
        '<div class="post-card-head">' +
          category +
          '<time datetime="' + esc(date) + '">' + esc(date) + '</time>' +
          '<span class="sep">·</span>' +
          '<span>' + post.viewCount + ' 次阅读</span>' +
          '<span class="sep">·</span>' +
          '<span>约 ' + post.readingMinutes + ' 分钟</span>' +
        '</div>' +
        '<h2>' + esc(post.title) + '</h2>' +
        '<p>' + esc(post.summary) + '</p>' +
      '</a>'
    );
  }

  function chipHtml(name, label, count, active) {
    return (
      '<button class="chip" type="button" data-category="' + esc(name) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
        esc(label) +
        '<span class="count">' + count + '</span>' +
      '</button>'
    );
  }

  function renderCategories(categories) {
    if (!categoryRow || !categoriesWrap) return;

    categoryRow.hidden = categories.length === 0;
    if (!categories.length) return;

    var total = categories.reduce(function (sum, item) {
      return sum + item.count;
    }, 0);

    categoriesWrap.innerHTML =
      chipHtml('', '全部', total, !state.category) +
      categories
        .map(function (item) {
          return chipHtml(item.slug, item.name, item.count, state.category === item.slug);
        })
        .join('');
  }

  function syncUrl() {
    var params = [];
    if (state.category) params.push('category=' + encodeURIComponent(state.category));
    if (state.q) params.push('q=' + encodeURIComponent(state.q));

    global.history.replaceState(
      null,
      '',
      global.location.pathname + (params.length ? '?' + params.join('&') : '')
    );
  }

  function syncPager() {
    var hasMore = state.page < state.totalPages;
    if (moreWrap) moreWrap.hidden = !hasMore;
    if (moreBtn) {
      moreBtn.disabled = false;
      moreBtn.textContent = '加载更多';
    }
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;

    if (reset) {
      state.page = 0;
      listWrap.innerHTML = '<div class="state">正在加载文章…</div>';
      emptyEl.hidden = true;
    }

    if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = '加载中…';
    }

    var query = '?page=' + (state.page + 1) + '&pageSize=' + PAGE_SIZE;
    if (state.category) query += '&category=' + encodeURIComponent(state.category);
    if (state.q) query += '&q=' + encodeURIComponent(state.q);

    global
      .fetch('/api/articles' + query, { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok || !payload || payload.code !== 0) {
            throw new Error((payload && payload.message) || '加载失败');
          }
          return payload.data;
        });
      })
      .then(function (data) {
        state.page += 1;
        state.total = data.pagination.total;
        state.totalPages = data.pagination.totalPages;

        if (reset) renderCategories(data.categories || []);

        countEl.textContent = data.pagination.total
          ? '共 ' + data.pagination.total + ' 篇' + (state.q ? '，匹配「' + state.q + '」' : '') + ' · 按时间倒序'
          : '还没有文章';

        if (!data.list.length) {
          listWrap.innerHTML = '';
          emptyEl.querySelector('strong').textContent =
            state.q || state.category ? '没有匹配的文章' : '还没有文章';
          emptyEl.hidden = false;
        } else {
          emptyEl.hidden = true;
          if (state.page === 1) listWrap.innerHTML = '';
          listWrap.insertAdjacentHTML('beforeend', data.list.map(cardHtml).join(''));
        }

        syncPager();
      })
      .catch(function (err) {
        if (state.page === 0) {
          util.showState(listWrap, {
            title: '文章加载失败',
            message: err.message,
            retry: function () {
              load(true);
            },
          });
        } else {
          countEl.textContent = err.message;
        }
        syncPager();
      })
      .then(function () {
        state.loading = false;
      });
  }

  if (categoriesWrap) {
    categoriesWrap.addEventListener('click', function (event) {
      var chip = event.target.closest('[data-category]');
      if (!chip) return;

      state.category = chip.getAttribute('data-category');
      syncUrl();
      load(true);
    });
  }

  if (searchEl) {
    var timer = null;
    searchEl.addEventListener('input', function () {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(function () {
        state.q = searchEl.value.trim();
        syncUrl();
        load(true);
      }, 320);
    });
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      load(false);
    });
  }

  syncUrl();
  load(true);
})(window, document);
