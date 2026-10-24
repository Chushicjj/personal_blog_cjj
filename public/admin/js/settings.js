(function (global, document) {
  'use strict';

  var Admin = global.Admin;
  var form = document.getElementById('settings-form');
  var saveBtn = document.getElementById('save');
  var resetBtn = document.getElementById('reset');

  var FIELDS = ['siteName', 'author', 'tagline', 'since', 'email', 'github'];

  var avatarUrl = '';
  var avatarImg = document.getElementById('avatar-img');
  var avatarInitial = document.getElementById('avatar-initial');
  var avatarFile = document.getElementById('avatar-file');
  var clearAvatarBtn = document.getElementById('clear-avatar');

  function el(name) {
    return document.getElementById(name);
  }

  /** 没有头像时显示作者名首字母，避免一片空白 */
  function initials(name) {
    var text = String(name || '').trim();
    if (!text) return '·';
    return text.slice(0, 2).toUpperCase();
  }

  function renderAvatar(author) {
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.hidden = false;
      avatarInitial.hidden = true;
      clearAvatarBtn.hidden = false;
      return;
    }

    avatarImg.removeAttribute('src');
    avatarImg.hidden = true;
    avatarInitial.hidden = false;
    avatarInitial.textContent = initials(author === undefined ? el('author').value : author);
    clearAvatarBtn.hidden = true;
  }

  function fill(values) {
    FIELDS.forEach(function (name) {
      el(name).value = values[name] === undefined || values[name] === null ? '' : values[name];
    });
    avatarUrl = values.avatar || '';
    renderAvatar(values.author);
  }

  function read() {
    var values = {};
    FIELDS.forEach(function (name) {
      values[name] = el(name).value.trim();
    });
    values.avatar = avatarUrl;
    return values;
  }

  function load() {
    return Admin.get('/settings')
      .then(fill)
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var values = read();

    if (!values.siteName) {
      Admin.toast('站点名不能为空', true);
      el('siteName').focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';

    Admin.put('/settings', values)
      .then(function (saved) {
        fill(saved);
        Admin.toast('设置已保存，前台刷新即可看到');
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      })
      .then(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存设置';
      });
  });

  resetBtn.addEventListener('click', function () {
    load().then(function () {
      Admin.toast('已恢复为已保存的值');
    });
  });

  document.getElementById('pick-avatar').addEventListener('click', function () {
    avatarFile.click();
  });

  avatarFile.addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;

    Admin.toast('正在上传头像…');
    Admin.upload(file)
      .then(function (item) {
        avatarUrl = item.url;
        renderAvatar();
        Admin.toast('头像已就绪，记得点保存');
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  });

  clearAvatarBtn.addEventListener('click', function () {
    avatarUrl = '';
    renderAvatar();
  });

  // 没有头像时，作者名变了首字母预览要跟着变
  el('author').addEventListener('input', function () {
    if (!avatarUrl) renderAvatar();
  });

  document.getElementById('logout').addEventListener('click', function (event) {
    event.preventDefault();
    Admin.logout().then(function () {
      global.location.replace('/admin/login.html');
    });
  });

  load();
})(window, document);
