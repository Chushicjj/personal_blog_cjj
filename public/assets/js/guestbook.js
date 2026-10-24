/**
 * 留言页：提交表单 + 分页加载历史留言。
 * 昵称与内容在渲染前统一转义，避免 XSS。
 */
(function (global, document) {
  'use strict';

  var util = global.BlogUtil;
  var api = global.BlogApi;
  var CONFIG = global.BLOG_CONFIG || {};

  var form = document.getElementById('guest-form');
  var nameInput = document.getElementById('guest-name');
  var contentInput = document.getElementById('guest-content');
  var counter = document.getElementById('guest-counter');
  var submit = document.getElementById('guest-submit');
  var note = document.getElementById('guest-note');
  var listWrap = document.getElementById('guest-list');
  var moreWrap = document.getElementById('guest-more');
  var moreBtn = document.getElementById('guest-load-more');
  var summary = document.getElementById('guest-summary');

  if (!form || !listWrap) return;

  var pageSize = CONFIG.pageSize || 10;
  var page = 0;
  var totalPages = 0;
  var total = 0;
  var loading = false;
  var listEl = null;
  // 记住已渲染的留言 id：发完新留言后列表整体后移一位，
  // 再点「加载更多」时服务端会返回一条已经显示过的记录，靠它去重
  var rendered = {};

  function itemHtml(message, isNew) {
    var initial = (message.nickname || '?').trim().charAt(0);
    return (
      '<li class="message' +
      (isNew ? ' is-new' : '') +
      '">' +
      '<span class="message-avatar" aria-hidden="true">' +
      util.escapeHtml(initial) +
      '</span>' +
      '<div class="message-body">' +
      '<div class="message-head">' +
      '<span class="message-name">' +
      util.escapeHtml(message.nickname) +
      '</span>' +
      '<time class="message-time">' +
      util.escapeHtml(util.relativeTime(message.createdAt)) +
      '</time>' +
      '</div>' +
      '<p class="message-text">' +
      util.escapeHtml(message.content) +
      '</p>' +
      '</div>' +
      '</li>'
    );
  }

  function ensureList() {
    if (listEl) return listEl;
    listEl = document.createElement('ul');
    listEl.className = 'message-list';
    listWrap.innerHTML = '';
    listWrap.appendChild(listEl);
    return listEl;
  }

  function setNote(text, type) {
    if (!note) return;
    note.textContent = text || '';
    note.className = 'form-note' + (type ? ' is-' + type : '');
  }

  function updateCounter() {
    if (!counter || !contentInput) return;
    counter.textContent = contentInput.value.length + ' / 500';
  }

  function updateSummary() {
    if (summary) summary.textContent = total ? total + ' 条' : '';
  }

  function syncMore() {
    if (!moreWrap) return;
    var hasMore = page < totalPages;
    moreWrap.hidden = !hasMore;
    if (moreBtn) {
      moreBtn.disabled = false;
      moreBtn.textContent = '加载更多';
    }
  }

  function loadNext() {
    if (loading) return;
    loading = true;

    if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = '加载中…';
    }

    api
      .getMessages({ page: page + 1, pageSize: pageSize })
      .then(function (data) {
        page += 1;
        total = data.pagination ? data.pagination.total : 0;
        totalPages = data.pagination ? data.pagination.totalPages : 0;
        updateSummary();

        if (!data.list || !data.list.length) {
          if (page === 1) {
            util.showState(listWrap, {
              title: '还没有留言',
              message: '来做第一个留下痕迹的人。'
            });
          }
          syncMore();
          return;
        }

        var ul = ensureList();
        var fresh = data.list.filter(function (m) {
          return !rendered[m.id];
        });

        if (fresh.length) {
          ul.insertAdjacentHTML('beforeend', fresh.map(function (m) { return itemHtml(m, false); }).join(''));
          fresh.forEach(function (m) {
            rendered[m.id] = true;
          });
        }

        syncMore();
      })
      .catch(function (err) {
        if (page === 0) {
          util.showState(listWrap, {
            title: '留言加载失败',
            message: err.message + (err.requestId ? '（requestId: ' + err.requestId + '）' : ''),
            retry: function () {
              loadNext();
            }
          });
        } else {
          setNote(err.message, 'error');
        }
        syncMore();
      })
      .then(function () {
        loading = false;
      });
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      if (page < totalPages) loadNext();
    });
  }

  if (contentInput) {
    contentInput.addEventListener('input', updateCounter);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    setNote('');

    var nickname = nameInput ? nameInput.value.trim() : '';
    var content = contentInput ? contentInput.value.trim() : '';

    if (!nickname) {
      setNote('昵称不能为空。', 'error');
      if (nameInput) nameInput.focus();
      return;
    }
    if (nickname.length > 20) {
      setNote('昵称最多 20 个字符。', 'error');
      if (nameInput) nameInput.focus();
      return;
    }
    if (!content) {
      setNote('留言内容不能为空。', 'error');
      if (contentInput) contentInput.focus();
      return;
    }
    if (content.length > 500) {
      setNote('留言内容最多 500 个字符。', 'error');
      if (contentInput) contentInput.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = '提交中…';

    api
      .createMessage(nickname, content)
      .then(function (message) {
        var ul = ensureList();
        ul.insertAdjacentHTML('afterbegin', itemHtml(message, true));
        rendered[message.id] = true;
        total += 1;
        updateSummary();
        syncMore();

        form.reset();
        updateCounter();
        setNote('留言已发布，谢谢反馈。', 'success');
      })
      .catch(function (err) {
        setNote(err.message + (err.requestId ? '（requestId: ' + err.requestId + '）' : ''), 'error');
      })
      .then(function () {
        submit.disabled = false;
        submit.textContent = '发表留言';
      });
  });

  updateCounter();
  loadNext();
})(window, document);
