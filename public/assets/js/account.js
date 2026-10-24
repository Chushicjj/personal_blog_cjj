/**
 * 账号页：登录 / 注册 / 退出。
 *
 * 登录成功后回到来源页（document.referrer 同源时），否则去文章列表，
 * 这样从某篇文章的「登录后才能评论」点过来，登录完能回到原文。
 */
(function (global, document) {
  'use strict';

  var form = document.getElementById('auth-form');
  if (!form) return;

  var tabs = document.getElementById('auth-tabs');
  var titleEl = document.getElementById('auth-title');
  var subEl = document.getElementById('auth-sub');
  var usernameEl = document.getElementById('username');
  var nicknameEl = document.getElementById('nickname');
  var nicknameField = document.getElementById('nickname-field');
  var passwordEl = document.getElementById('password');
  var submitBtn = document.getElementById('auth-submit');
  var noteEl = document.getElementById('auth-note');
  var meBox = document.getElementById('auth-me');
  var meName = document.getElementById('me-name');
  var logoutBtn = document.getElementById('auth-logout');

  var mode = 'login';
  var busy = false;

  function setNote(text, isError) {
    noteEl.textContent = text || '';
    noteEl.className = 'auth-note' + (isError ? ' is-error' : '');
  }

  function setMode(next) {
    mode = next;

    Array.prototype.forEach.call(tabs.querySelectorAll('[data-mode]'), function (button) {
      var active = button.getAttribute('data-mode') === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    var isLogin = next === 'login';
    nicknameField.hidden = isLogin;
    titleEl.textContent = isLogin ? '登录' : '注册';
    subEl.textContent = isLogin ? '登录后即可在文章下留言评论。' : '注册一个账号，之后就能在文章下评论。';
    submitBtn.textContent = isLogin ? '登录' : '注册并登录';
    passwordEl.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
    setNote('');
  }

  function goBack() {
    var referrer = document.referrer || '';
    try {
      var url = new URL(referrer);
      if (url.origin === global.location.origin && url.pathname !== '/account.html') {
        global.location.replace(referrer);
        return;
      }
    } catch (err) {
      /* referrer 不可用时直接走兜底 */
    }
    global.location.replace('/posts.html');
  }

  function request(path, body) {
    return global.fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body || {}),
    }).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok || !payload || payload.code !== 0) {
          throw new Error((payload && payload.message) || '请求失败');
        }
        return payload.data;
      });
    });
  }

  function showLoggedIn(user) {
    form.hidden = true;
    tabs.hidden = true;
    titleEl.textContent = '账号';
    subEl.textContent = '你已经登录，可以回到文章页发表评论了。';
    meName.textContent = user.nickname;
    meBox.hidden = false;
    setNote('');
  }

  tabs.addEventListener('click', function (event) {
    var button = event.target.closest('[data-mode]');
    if (!button) return;
    var next = button.getAttribute('data-mode');
    if (next !== mode) setMode(next);
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;

    var username = usernameEl.value.trim();
    var pass = passwordEl.value;

    if (!username) {
      setNote('请填写用户名', true);
      usernameEl.focus();
      return;
    }
    if (!pass) {
      setNote('请填写密码', true);
      passwordEl.focus();
      return;
    }

    var payload = { username: username, password: pass };
    var path = '/api/auth/login';

    if (mode === 'register') {
      path = '/api/auth/register';
      var nickname = nicknameEl.value.trim();
      if (nickname) payload.nickname = nickname;
    }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'login' ? '登录中…' : '注册中…';
    setNote('');

    request(path, payload)
      .then(function () {
        goBack();
      })
      .catch(function (err) {
        setNote(err.message, true);
      })
      .then(function () {
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? '登录' : '注册并登录';
      });
  });

  logoutBtn.addEventListener('click', function () {
    request('/api/auth/logout')
      .then(function () {
        global.location.reload();
      })
      .catch(function (err) {
        setNote(err.message, true);
      });
  });

  // 已登录就直接展示账号状态
  global
    .fetch('/api/auth/me', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json();
    })
    .then(function (payload) {
      if (payload && payload.code === 0 && payload.data && payload.data.user) {
        showLoggedIn(payload.data.user);
      }
    })
    .catch(function () {});
})(window, document);
