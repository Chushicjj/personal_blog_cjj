(function (global, document) {
  'use strict';

  var Admin = global.Admin;
  var esc = Admin.escapeHtml;

  var tbody = document.getElementById('rows');
  var empty = document.getElementById('empty');
  var countEl = document.getElementById('count');
  var moreBtn = document.getElementById('more');
  var search = document.getElementById('search');
  var statusFilter = document.getElementById('status-filter');
  var who = document.getElementById('who');

  var PAGE_SIZE = 20;
  var state = { page: 0, totalPages: 0, total: 0, loading: false };

  function rowHtml(item) {
    var statusBadge = item.status === 1
      ? '<span class="badge is-live">已发布</span>'
      : '<span class="badge is-draft">草稿</span>';

    // 已发布但时间在未来 = 定时发布
    if (item.status === 1 && item.publishedAt && new Date(String(item.publishedAt).replace(' ', 'T')) > new Date()) {
      statusBadge = '<span class="badge">定时</span>';
    }

    var top = item.isTop ? ' <span class="badge">置顶</span>' : '';

    var toggleLabel = item.status === 1 ? '转为草稿' : '发布';
    var preview = item.status === 1
      ? '<a href="/posts/' + encodeURIComponent(item.slug) + '" target="_blank" rel="noopener">预览</a>'
      : '<span></span>';

    return (
      '<tr data-id="' + item.id + '">' +
        '<td>' +
          '<a class="cell-title" href="/admin/editor.html?id=' + item.id + '">' + esc(item.title) + top + '</a>' +
          '<span class="cell-slug">/' + esc(item.slug) + '</span>' +
        '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td class="cell-meta">' + item.viewCount + '</td>' +
        '<td class="cell-meta">' + esc(Admin.formatDateTime(item.updatedAt || item.createdAt)) + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            preview +
            '<button type="button" data-action="toggle">' + toggleLabel + '</button>' +
            '<button type="button" class="danger" data-action="delete">删除</button>' +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }

  function renderStats(data) {
    var cells = document.querySelectorAll('#stats .stat b');
    cells[0].textContent = data.articles.total;
    cells[1].textContent = data.articles.published;
    cells[2].textContent = data.articles.drafts;
    cells[3].textContent = data.articles.views;
  }

  function syncPager() {
    moreBtn.hidden = state.page >= state.totalPages;
    countEl.textContent = state.total ? '共 ' + state.total + ' 篇，已显示 ' + tbody.children.length + ' 篇' : '';
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;

    if (reset) {
      state.page = 0;
      tbody.innerHTML = '';
      empty.hidden = true;
    }

    moreBtn.disabled = true;
    moreBtn.textContent = '加载中…';

    var query = '?page=' + (state.page + 1) + '&pageSize=' + PAGE_SIZE;
    if (statusFilter.value !== '') query += '&status=' + encodeURIComponent(statusFilter.value);
    if (search.value.trim()) query += '&q=' + encodeURIComponent(search.value.trim());

    Admin.get('/articles' + query)
      .then(function (data) {
        state.page += 1;
        state.total = data.pagination.total;
        state.totalPages = data.pagination.totalPages;

        tbody.insertAdjacentHTML('beforeend', data.list.map(rowHtml).join(''));

        if (!data.list.length && state.page === 1) {
          empty.hidden = false;
        }

        syncPager();
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      })
      .then(function () {
        state.loading = false;
        moreBtn.disabled = false;
        moreBtn.textContent = '加载更多';
      });
  }

  tbody.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var row = button.closest('tr');
    var id = Number(row.getAttribute('data-id'));
    var action = button.getAttribute('data-action');
    var isLive = row.querySelector('.badge.is-live');

    if (action === 'toggle') {
      button.disabled = true;
      var nextStatus = isLive ? 0 : 1;

      Admin.patch('/articles/' + id + '/status', { status: nextStatus })
        .then(function () {
          Admin.toast(nextStatus ? '已发布' : '已转为草稿');
          load(true);
          loadStats();
        })
        .catch(function (err) {
          Admin.toast(err.message, true);
        })
        .then(function () {
          button.disabled = false;
        });
      return;
    }

    if (action === 'delete') {
      if (!global.confirm('删除后前台立刻不可见（数据仍在库中，可恢复）。确定删除？')) return;

      button.disabled = true;
      Admin.del('/articles/' + id)
        .then(function () {
          Admin.toast('已删除');
          load(true);
          loadStats();
        })
        .catch(function (err) {
          Admin.toast(err.message, true);
          button.disabled = false;
        });
    }
  });

  var searchTimer = null;
  search.addEventListener('input', function () {
    if (searchTimer) global.clearTimeout(searchTimer);
    searchTimer = global.setTimeout(function () {
      load(true);
    }, 280);
  });

  statusFilter.addEventListener('change', function () {
    load(true);
  });

  moreBtn.addEventListener('click', function () {
    load(false);
  });

  document.getElementById('logout').addEventListener('click', function (event) {
    event.preventDefault();
    Admin.logout().then(function () {
      global.location.replace('/admin/login.html');
    });
  });

  function loadStats() {
    Admin.get('/stats')
      .then(renderStats)
      .catch(function () {});
  }

  Admin.me()
    .then(function (me) {
      who.textContent = '已登录：' + me.username;
    })
    .catch(function () {});

  loadStats();
  load(true);
})(window, document);
