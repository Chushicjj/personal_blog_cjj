(function (global, document) {
  'use strict';

  var Admin = global.Admin;
  var form = document.getElementById('login-form');
  var username = document.getElementById('username');
  var password = document.getElementById('password');
  var submit = document.getElementById('submit');
  var note = document.getElementById('note');

  function setNote(text, isError) {
    note.textContent = text || '';
    note.className = 'form-note' + (isError ? ' is-error' : '');
  }

  // 已登录就直接进后台，省一次输入
  Admin.me()
    .then(function () {
      global.location.replace('/admin/');
    })
    .catch(function () {
      /* 未登录，留在当前页 */
    });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    setNote('');

    var user = username.value.trim();
    var pass = password.value;

    if (!user || !pass) {
      setNote('请填写账号和密码。', true);
      return;
    }

    submit.disabled = true;
    submit.textContent = '登录中…';

    Admin.post('/login', { username: user, password: pass })
      .then(function () {
        global.location.replace('/admin/');
      })
      .catch(function (err) {
        setNote(err.message, true);
        password.value = '';
        password.focus();
      })
      .then(function () {
        submit.disabled = false;
        submit.textContent = '登录';
      });
  });
})(window, document);
