(function (global, document) {
  'use strict';

  var Admin = global.Admin;
  var esc = Admin.escapeHtml;

  var el = {
    chips: document.getElementById('page-chips'),
    state: document.getElementById('state'),
    title: document.getElementById('title'),
    key: document.getElementById('key'),
    urlHint: document.getElementById('url-hint'),
    content: document.getElementById('content'),
    preview: document.getElementById('preview'),
    wordInfo: document.getElementById('word-info'),
    save: document.getElementById('save'),
    del: document.getElementById('delete'),
    previewLink: document.getElementById('preview-link')
  };

  var current = 'about';
  var dirty = false;
  var saving = false;
  var previewTimer = null;

  var KEY_RE = /^[a-z][a-z0-9-]{0,49}$/;

  function publicUrl(key) {
    return key === 'about' ? '/about.html' : '/p/' + encodeURIComponent(key);
  }

  function syncUrlHint() {
    el.urlHint.textContent = current === 'about' ? '公开地址：/about.html' : '公开地址：/p/' + current;
    el.del.disabled = current === 'about';
    el.del.title = current === 'about' ? '关于页是站点固定入口，不可删除' : '';
  }

  function renderChips(keys) {
    var list = keys.slice();
    if (list.indexOf('about') === -1) list.unshift('about');

    el.chips.innerHTML = list
      .map(function (key) {
        var pressed = key === current ? 'true' : 'false';
        return (
          '<button class="chip" type="button" data-key="' + esc(key) + '" aria-pressed="' + pressed + '">' +
            esc(key === 'about' ? '关于页' : key) +
          '</button>'
        );
      })
      .join('') +
      '<button class="chip" type="button" data-action="new" aria-pressed="false">＋ 新建页面</button>';
  }

  function refreshList() {
    return Admin.get('/pages').then(function (data) {
      renderChips((data.list || []).map(function (item) {
        return item.key;
      }));
    });
  }

  function schedulePreview() {
    if (previewTimer) global.clearTimeout(previewTimer);
    previewTimer = global.setTimeout(renderPreview, 420);
  }

  function renderPreview() {
    var source = el.content.value;

    if (!source.trim()) {
      el.preview.innerHTML = '<p class="preview-empty">（空白页面）</p>';
      el.wordInfo.textContent = '';
      return;
    }

    Admin.post('/articles/preview', { contentMd: source })
      .then(function (data) {
        el.preview.innerHTML = data.html || '<p class="preview-empty">（空白页面）</p>';
        el.wordInfo.textContent = data.wordCount + ' 字';
      })
      .catch(function (err) {
        el.wordInfo.textContent = '预览失败：' + err.message;
      });
  }

  function fill(data) {
    el.title.value = data.title || '';
    el.content.value = data.contentMd || '';
    el.key.value = data.key;
    el.state.textContent = data.updatedAt ? '最后更新 ' + Admin.formatDateTime(data.updatedAt) : '尚未填写内容';
    syncUrlHint();
    renderPreview();
    dirty = false;
  }

  function select(key) {
    current = key;
    Array.prototype.forEach.call(el.chips.querySelectorAll('[data-key]'), function (chip) {
      chip.setAttribute('aria-pressed', chip.getAttribute('data-key') === key ? 'true' : 'false');
    });

    Admin.get('/pages/' + encodeURIComponent(key))
      .then(fill)
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  }

  function save() {
    if (saving) return;

    var title = el.title.value.trim();
    var contentMd = el.content.value;

    if (!title) {
      Admin.toast('页面标题不能为空', true);
      el.title.focus();
      return;
    }
    if (!contentMd.trim()) {
      Admin.toast('页面内容不能为空', true);
      el.content.focus();
      return;
    }

    saving = true;
    el.save.disabled = true;
    el.save.textContent = '保存中…';

    Admin.put('/pages/' + encodeURIComponent(current), { title: title, contentMd: contentMd })
      .then(function (data) {
        dirty = false;
        el.state.textContent = '已保存 · ' + Admin.formatDateTime(data.updatedAt);
        Admin.toast('已保存，前台刷新即可看到');
        refreshList();
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      })
      .then(function () {
        saving = false;
        el.save.disabled = false;
        el.save.textContent = '保存页面';
      });
  }

  el.chips.addEventListener('click', function (event) {
    var newBtn = event.target.closest('[data-action="new"]');
    if (newBtn) {
      var input = global.prompt('新页面的 URL 标识（小写字母开头，可含数字和短横线）', '');
      if (input === null) return;

      var key = String(input).trim().toLowerCase();
      if (!KEY_RE.test(key)) {
        Admin.toast('标识不合法：只能小写字母开头，含小写字母、数字、短横线', true);
        return;
      }

      current = key;
      el.title.value = '';
      el.content.value = '';
      el.key.value = key;
      syncUrlHint();
      el.state.textContent = '新页面，尚未保存';

      // 新建的 key 服务端还没有记录，select 会拿到空内容，直接进入编辑态
      refreshList().then(function () {
        select(key);
      });
      return;
    }

    var chip = event.target.closest('[data-key]');
    if (!chip) return;

    var nextKey = chip.getAttribute('data-key');
    if (nextKey === current) return;
    if (dirty && !global.confirm('当前页面有未保存的修改，确定切换？')) return;

    select(nextKey);
  });

  var SNIPPETS = {
    code: '```bash\n\n```',
    list: '- 第一项\n- 第二项',
    quote: '> 引用'
  };

  document.querySelectorAll('[data-insert]').forEach(function (button) {
    button.addEventListener('click', function () {
      var kind = button.getAttribute('data-insert');
      var text = SNIPPETS[kind];
      var area = el.content;
      var start = area.selectionStart;
      var before = area.value.slice(0, start);
      var after = area.value.slice(area.selectionEnd);
      var prefix = before && !/\n$/.test(before) ? '\n\n' : '';

      area.value = before + prefix + text + after;
      area.selectionStart = area.selectionEnd = (before + prefix + text).length;
      area.focus();
      dirty = true;
      schedulePreview();
    });
  });

  el.content.addEventListener('input', function () {
    dirty = true;
    schedulePreview();
  });

  el.title.addEventListener('input', function () {
    dirty = true;
  });

  el.save.addEventListener('click', save);

  el.del.addEventListener('click', function () {
    if (current === 'about') return;
    if (!global.confirm('删除页面「' + current + '」？该地址会立即 404。')) return;

    Admin.del('/pages/' + encodeURIComponent(current))
      .then(function () {
        Admin.toast('已删除');
        current = 'about';
        refreshList().then(function () {
          select('about');
        });
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  });

  el.previewLink.addEventListener('click', function () {
    global.open(publicUrl(current), '_blank', 'noopener');
  });

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  global.addEventListener('beforeunload', function (event) {
    if (!dirty) return undefined;
    event.preventDefault();
    event.returnValue = '';
    return '';
  });

  document.getElementById('logout').addEventListener('click', function (event) {
    event.preventDefault();
    if (dirty && !global.confirm('有未保存的修改，确定退出？')) return;
    Admin.logout().then(function () {
      global.location.replace('/admin/login.html');
    });
  });

  refreshList().then(function () {
    select('about');
  });
})(window, document);
