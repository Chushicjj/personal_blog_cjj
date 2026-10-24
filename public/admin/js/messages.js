(function (global, document) {
  'use strict';

  var Admin = global.Admin;
  var esc = Admin.escapeHtml;

  var tbody = document.getElementById('rows');
  var userRows = document.getElementById('user-rows');
  var table = document.getElementById('list-table');
  var wrapRecords = document.getElementById('wrap-records');
  var wrapUsers = document.getElementById('wrap-users');
  var tabs = document.getElementById('source-tabs');
  var empty = document.getElementById('empty');
  var emptyText = empty.querySelector('strong');
  var countEl = document.getElementById('count');
  var summaryEl = document.getElementById('summary');
  var moreBtn = document.getElementById('more');
  var search = document.getElementById('search');
  var selectAllBtn = document.getElementById('select-all');
  var batchBtn = document.getElementById('batch-delete');

  var PAGE_SIZE = 20;
  var state = { source: 'messages', page: 0, totalPages: 0, total: 0, loading: false };

  var LABEL = {
    messages: { title: '留言', empty: '还没有留言', unit: '条留言' },
    comments: { title: '评论', empty: '还没有评论', unit: '条评论' },
    users: { title: '用户', empty: '还没有注册用户', unit: '个用户' },
  };

  function isUsers() {
    return state.source === 'users';
  }

  function activeRows() {
    return isUsers() ? userRows : tbody;
  }

  /* ---------------------------- 留言 / 评论行 ---------------------------- */

  function rowHtml(item) {
    // 评论多一列「文章」，留言板没有归属文章
    var articleCell = '';

    if (state.source === 'comments') {
      var title = esc(item.articleTitle || '（文章已删除）');
      var content = item.articleSlug
        ? '<a href="/posts/' + encodeURIComponent(item.articleSlug) + '" target="_blank" rel="noopener">' + title + '</a>'
        : title;
      articleCell = '<td class="col-article cell-meta">' + content + '</td>';
    }

    return (
      '<tr data-id="' + item.id + '">' +
        '<td><input type="checkbox" class="pick" aria-label="选择这条记录"></td>' +
        '<td class="cell-meta">' + esc(item.nickname) + '</td>' +
        '<td style="white-space:pre-wrap;line-height:1.65">' + esc(item.content) + '</td>' +
        articleCell +
        '<td class="cell-meta">' + esc(item.ipAddress || '—') + '</td>' +
        '<td class="cell-meta">' + esc(Admin.formatDateTime(item.createdAt)) + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            '<button type="button" class="danger" data-action="delete">删除</button>' +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }

  /* ---------------------------- 用户行 ---------------------------- */

  function userRow(item) {
    var disabled = Number(item.status) !== 1;

    return (
      '<tr data-id="' + item.id + '" data-status="' + item.status + '">' +
        '<td>' +
          '<span class="cell-title">' + esc(item.username) + '</span>' +
          (disabled ? ' <span class="badge is-draft">已禁用</span>' : '') +
        '</td>' +
        '<td class="cell-meta">' + esc(item.nickname) + '</td>' +
        '<td class="cell-meta">' + item.commentCount + '</td>' +
        '<td class="cell-meta">' + esc(Admin.formatDateTime(item.createdAt)) + '</td>' +
        '<td class="cell-meta">' + esc(item.lastLoginAt ? Admin.formatDateTime(item.lastLoginAt) : '—') + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            '<button type="button" data-user="status">' + (disabled ? '启用' : '禁用') + '</button>' +
            '<button type="button" class="danger" data-user="delete">删除</button>' +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }

  /* ---------------------------- 通用 ---------------------------- */

  function selectedIds() {
    var boxes = tbody.querySelectorAll('.pick:checked');
    return Array.prototype.map.call(boxes, function (box) {
      return Number(box.closest('tr').getAttribute('data-id'));
    });
  }

  function syncBatchButton() {
    var ids = selectedIds();
    batchBtn.disabled = ids.length === 0;
    batchBtn.textContent = '删除所选（' + ids.length + '）';
  }

  function syncPager() {
    var rendered = activeRows().children.length;
    moreBtn.hidden = state.page >= state.totalPages;
    countEl.textContent = state.total ? '已显示 ' + rendered + ' / ' + state.total + ' 条' : '';
    summaryEl.textContent = state.total ? '共 ' + state.total + ' ' + LABEL[state.source].unit : '';
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;

    if (reset) {
      state.page = 0;
      tbody.innerHTML = '';
      userRows.innerHTML = '';
      empty.hidden = true;
      selectAllBtn.textContent = '全选本页';
      syncBatchButton();
    }

    moreBtn.disabled = true;
    moreBtn.textContent = '加载中…';

    var query = '?page=' + (state.page + 1) + '&pageSize=' + PAGE_SIZE;
    if (search.value.trim()) query += '&q=' + encodeURIComponent(search.value.trim());

    Admin.get('/' + state.source + query)
      .then(function (data) {
        state.page += 1;
        state.total = data.pagination.total;
        state.totalPages = data.pagination.totalPages;

        var html = (data.list || []).map(isUsers() ? userRow : rowHtml).join('');
        activeRows().insertAdjacentHTML('beforeend', html);

        if (!data.list.length && state.page === 1) empty.hidden = false;

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

  tabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-source]');
    if (!button) return;

    var next = button.getAttribute('data-source');
    if (next === state.source) return;

    state.source = next;

    Array.prototype.forEach.call(tabs.querySelectorAll('[data-source]'), function (item) {
      var active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    var users = isUsers();
    wrapRecords.hidden = users;
    wrapUsers.hidden = !users;
    // 用户是按账号管理的，勾选批量删不适用
    selectAllBtn.hidden = users;
    batchBtn.hidden = users;
    table.classList.toggle('is-comments', next === 'comments');
    search.placeholder = users ? '搜索用户名或昵称' : '搜索昵称或内容';
    emptyText.textContent = LABEL[next].empty;
    summaryEl.textContent = '';
    load(true);
  });

  tbody.addEventListener('change', function (event) {
    if (event.target.classList.contains('pick')) syncBatchButton();
  });

  tbody.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action="delete"]');
    if (!button) return;

    var row = button.closest('tr');
    var id = Number(row.getAttribute('data-id'));
    var noun = LABEL[state.source].title;

    if (!global.confirm('删除这条' + noun + '？删除后前台立刻不可见，无法恢复。')) return;

    button.disabled = true;

    Admin.del('/' + state.source + '/' + id)
      .then(function () {
        Admin.toast('已删除');
        load(true);
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
        button.disabled = false;
      });
  });

  userRows.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-user]');
    if (!button) return;

    var row = button.closest('tr');
    var id = Number(row.getAttribute('data-id'));
    var active = Number(row.getAttribute('data-status')) === 1;
    var username = row.querySelector('.cell-title').textContent;

    if (button.getAttribute('data-user') === 'status') {
      button.disabled = true;
      Admin.patch('/users/' + id + '/status', { status: active ? 0 : 1 })
        .then(function () {
          Admin.toast(active ? '已禁用，该用户已被强制下线' : '已启用');
          load(true);
        })
        .catch(function (err) {
          Admin.toast(err.message, true);
          button.disabled = false;
        });
      return;
    }

    if (!global.confirm('删除账号「' + username + '」？该用户的评论会保留，但不再关联账号。')) return;

    button.disabled = true;
    Admin.del('/users/' + id)
      .then(function () {
        Admin.toast('已删除账号');
        load(true);
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
        button.disabled = false;
      });
  });

  selectAllBtn.addEventListener('click', function () {
    var boxes = tbody.querySelectorAll('.pick');
    if (!boxes.length) return;

    var allChecked = Array.prototype.every.call(boxes, function (box) {
      return box.checked;
    });

    Array.prototype.forEach.call(boxes, function (box) {
      box.checked = !allChecked;
    });

    selectAllBtn.textContent = allChecked ? '全选本页' : '取消全选';
    syncBatchButton();
  });

  batchBtn.addEventListener('click', function () {
    var ids = selectedIds();
    if (!ids.length) return;

    var noun = LABEL[state.source].title;
    if (!global.confirm('确定删除选中的 ' + ids.length + ' 条' + noun + '？此操作不可恢复。')) return;

    batchBtn.disabled = true;
    Admin.post('/' + state.source + '/batch-delete', { ids: ids })
      .then(function (data) {
        Admin.toast(data && data.deleted ? '已删除 ' + data.deleted + ' 条' : '已删除');
        selectAllBtn.textContent = '全选本页';
        load(true);
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
        syncBatchButton();
      });
  });

  var searchTimer = null;
  search.addEventListener('input', function () {
    if (searchTimer) global.clearTimeout(searchTimer);
    searchTimer = global.setTimeout(function () {
      load(true);
    }, 280);
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

  load(true);
})(window, document);
