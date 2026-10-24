/**
 * 文章评论：提交、加载更多。
 *
 * 首屏评论由服务端直出（SEO + 无 JS 也能看），这里只做增量：
 *   - 提交成功后插到列表最前面（列表按时间倒序）
 *   - 「加载更多」按页往后取更早的
 *
 * 登录状态同样由服务端决定：未登录时页面里根本没有 #comment-form，
 * 这一段直接 return，不会出现「填完才发现要登录」。
 */
(function (global, document) {
  'use strict';

  var section = document.getElementById('comments');
  if (!section) return;

  var util = global.BlogUtil;
  var esc = util.escapeHtml;

  var slug = section.getAttribute('data-slug') || '';
  var pageSize = Number(section.getAttribute('data-page-size')) || 10;

  var listEl = document.getElementById('comment-list');
  var countEl = document.getElementById('comment-count');
  var emptyEl = document.getElementById('comment-empty');
  var moreBtn = document.getElementById('comment-more');
  var form = document.getElementById('comment-form');
  var contentInput = document.getElementById('comment-content');
  var noteEl = document.getElementById('comment-note');
  var submitBtn = document.getElementById('comment-submit');

  var page = 1;
  var total = Number(countEl ? countEl.textContent : 0) || 0;
  var sending = false;

  function setNote(text, isError) {
    if (!noteEl) return;
    noteEl.textContent = text || '';
    noteEl.style.color = isError ? '#b03a3a' : '';
  }

  function itemHtml(comment) {
    return (
      '<li class="comment" data-id="' + Number(comment.id) + '">' +
        '<div class="comment-head">' +
          '<span class="comment-name">' + esc(comment.nickname) + '</span>' +
          '<time class="comment-time">' + esc(String(comment.createdAt || '').slice(0, 16)) + '</time>' +
        '</div>' +
        '<p class="comment-text">' + esc(comment.content) + '</p>' +
      '</li>'
    );
  }

  function syncTotal(next) {
    total = next;
    if (countEl) countEl.textContent = String(total);
    if (emptyEl) emptyEl.hidden = total > 0;
    if (moreBtn) moreBtn.hidden = !listEl || listEl.children.length >= total;
  }

  function request(url, options) {
    return global.fetch(url, options).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok || !payload || payload.code !== 0) {
          throw new Error((payload && payload.message) || '请求失败');
        }
        return payload.data;
      });
    });
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      if (moreBtn.disabled) return;

      moreBtn.disabled = true;
      moreBtn.textContent = '加载中…';

      var next = page + 1;
      request('/api/articles/' + encodeURIComponent(slug) + '/comments?page=' + next + '&pageSize=' + pageSize)
        .then(function (data) {
          page = next;
          listEl.insertAdjacentHTML('beforeend', (data.list || []).map(itemHtml).join(''));
          syncTotal(data.pagination.total);
        })
        .catch(function (err) {
          setNote(err.message, true);
        })
        .then(function () {
          moreBtn.disabled = false;
          moreBtn.textContent = '加载更多评论';
          syncTotal(total);
        });
    });
  }

  // 未登录：服务端只渲染了登录入口，没有表单
  if (!form) return;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) return;

    var content = contentInput.value.trim();

    if (!content) {
      setNote('评论内容不能为空', true);
      contentInput.focus();
      return;
    }

    sending = true;
    submitBtn.disabled = true;
    submitBtn.textContent = '发布中…';
    setNote('');

    request('/api/articles/' + encodeURIComponent(slug) + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // 昵称由服务端从会话取，这里不传，避免冒名
      body: JSON.stringify({ content: content }),
    })
      .then(function (comment) {
        listEl.insertAdjacentHTML('afterbegin', itemHtml(comment));
        contentInput.value = '';
        setNote('已发布，谢谢留言。');
        syncTotal(total + 1);
      })
      .catch(function (err) {
        setNote(err.message, true);
      })
      .then(function () {
        sending = false;
        submitBtn.disabled = false;
        submitBtn.textContent = '发表评论';
      });
  });
})(window, document);
