(function (global, document) {
  'use strict';

  var Admin = global.Admin;

  var el = {
    pageTitle: document.getElementById('page-title'),
    saveState: document.getElementById('save-state'),
    title: document.getElementById('title'),
    slug: document.getElementById('slug'),
    category: document.getElementById('category'),
    publishAt: document.getElementById('publish-at'),
    manageCategories: document.getElementById('manage-categories'),
    categoryPanel: document.getElementById('category-panel'),
    categoryList: document.getElementById('category-list'),
    summary: document.getElementById('summary'),
    content: document.getElementById('content'),
    preview: document.getElementById('preview'),
    wordInfo: document.getElementById('word-info'),
    isTop: document.getElementById('is-top'),
    coverPreview: document.getElementById('cover-preview'),
    coverName: document.getElementById('cover-name'),
    clearCover: document.getElementById('clear-cover'),
    pickCover: document.getElementById('pick-cover'),
    contentFile: document.getElementById('content-file'),
    videoFile: document.getElementById('video-file'),
    coverFile: document.getElementById('cover-file'),
    saveDraft: document.getElementById('save-draft'),
    publish: document.getElementById('publish')
  };

  var articleId = Number(Admin.param('id')) || 0;
  var currentStatus = 0;
  var coverUrl = '';
  var dirty = false;
  var saving = false;
  // 分类下拉是异步加载的，文章可能先回来，先记下来等选项就位再设值
  var pendingCategoryId = null;

  /* ---------------------------- 分类 ---------------------------- */

  var categories = [];
  var lastCategoryId = '';

  function renderCategories(selectedId) {
    var target = selectedId === undefined || selectedId === null ? lastCategoryId : String(selectedId);
    if (target === '__new') target = '';

    el.category.innerHTML =
      '<option value="">未分类</option>' +
      categories
        .map(function (item) {
          return '<option value="' + item.id + '">' + Admin.escapeHtml(item.name) + '</option>';
        })
        .join('') +
      '<option value="__new">＋ 新建分类…</option>';

    el.category.value = target;
    lastCategoryId = el.category.value;
  }

  /** 管理面板：列出全部分类，每行可改名/删除，不依赖当前下拉框选中了谁 */
  function renderCategoryPanel() {
    if (!el.categoryList) return;

    if (!categories.length) {
      el.categoryList.innerHTML = '<li class="category-empty">还没有分类，先在下拉框里选「＋ 新建分类…」</li>';
      return;
    }

    el.categoryList.innerHTML = categories
      .map(function (item) {
        return (
          '<li class="category-row" data-id="' + item.id + '">' +
            '<span class="category-name">' + Admin.escapeHtml(item.name) + '</span>' +
            '<span class="category-count">' + (item.count || 0) + ' 篇</span>' +
            '<span class="category-ops">' +
              '<button type="button" data-cat="rename">重命名</button>' +
              '<button type="button" class="danger" data-cat="delete">删除</button>' +
            '</span>' +
          '</li>'
        );
      })
      .join('');
  }

  function reloadCategories(selectedId) {
    return Admin.get('/taxonomy').then(function (data) {
      categories = data.categories || [];
      renderCategories(selectedId);
      renderCategoryPanel();
    });
  }

  el.category.addEventListener('change', function () {
    if (el.category.value !== '__new') {
      lastCategoryId = el.category.value;
      return;
    }

    var input = global.prompt('新分类名称（最多 50 字）', '');
    var name = input === null ? '' : input.trim();

    if (!name) {
      renderCategories(lastCategoryId);
      return;
    }

    Admin.post('/taxonomy/categories', { name: name })
      .then(function (data) {
        dirty = true;
        return reloadCategories(String(data.id)).then(function () {
          Admin.toast('分类「' + data.name + '」已创建');
        });
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
        renderCategories(lastCategoryId);
      });
  });

  el.manageCategories.addEventListener('click', function () {
    var open = el.categoryPanel.hidden;
    el.categoryPanel.hidden = !open;
    el.manageCategories.textContent = open ? '收起管理' : '管理分类';
    if (open) renderCategoryPanel();
  });

  el.categoryList.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-cat]');
    if (!button) return;

    var row = button.closest('.category-row');
    var id = Number(row.getAttribute('data-id'));
    var name = row.querySelector('.category-name').textContent;
    var entry = categories.filter(function (item) {
      return item.id === id;
    })[0] || { count: 0 };

    if (button.getAttribute('data-cat') === 'rename') {
      var input = global.prompt('分类新名称', name);
      var next = input === null ? '' : input.trim();
      if (!next || next === name) return;

      Admin.patch('/taxonomy/categories/' + id, { name: next })
        .then(function () {
          dirty = true;
          return reloadCategories(id).then(function () {
            Admin.toast('分类已重命名');
          });
        })
        .catch(function (err) {
          Admin.toast(err.message, true);
        });
      return;
    }

    var warning = entry.count
      ? '删除分类「' + name + '」？该分类下的 ' + entry.count + ' 篇文章会变成未分类，文章本身不会被删除。'
      : '删除分类「' + name + '」？';

    if (!global.confirm(warning)) return;

    // 删掉的正好是当前选中的分类时，回退到「未分类」
    var keep = el.category.value === String(id) ? '' : lastCategoryId;

    button.disabled = true;
    Admin.del('/taxonomy/categories/' + id)
      .then(function () {
        dirty = true;
        return reloadCategories(keep).then(function () {
          Admin.toast('分类已删除');
        });
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
        button.disabled = false;
      });
  });

  /* ---------------------------- 预览 ---------------------------- */

  var previewTimer = null;

  function renderPreview() {
    var source = el.content.value;

    if (!source.trim()) {
      el.preview.innerHTML = '<p class="preview-empty">开始写，右侧会实时渲染。</p>';
      el.wordInfo.textContent = '';
      return;
    }

    Admin.post('/articles/preview', { contentMd: source })
      .then(function (data) {
        el.preview.innerHTML = data.html || '<p class="preview-empty">（空白）</p>';
        el.wordInfo.textContent = data.wordCount + ' 字 · 约 ' + data.readingMinutes + ' 分钟';
      })
      .catch(function (err) {
        el.wordInfo.textContent = '预览失败：' + err.message;
      });
  }

  function schedulePreview() {
    if (previewTimer) global.clearTimeout(previewTimer);
    previewTimer = global.setTimeout(renderPreview, 420);
  }

  /* ---------------------------- 插入片段 ---------------------------- */

  function insertAtCursor(text, cursorOffset) {
    var area = el.content;
    var start = area.selectionStart;
    var end = area.selectionEnd;
    var before = area.value.slice(0, start);
    var after = area.value.slice(end);

    var prefix = before && !/\n$/.test(before) ? '\n\n' : '';
    var inserted = prefix + text;

    area.value = before + inserted + after;

    var caret = before.length + (cursorOffset === undefined ? inserted.length : prefix.length + cursorOffset);
    area.selectionStart = area.selectionEnd = caret;
    area.focus();

    dirty = true;
    schedulePreview();
  }

  var SNIPPETS = {
    image: '![图片说明](/media/占位.png)',
    code: '```js\n\n```',
    table: '| 列一 | 列二 |\n| --- | --- |\n| 值 | 值 |',
    link: '[链接文字](https://)'
  };

  document.querySelectorAll('[data-insert]').forEach(function (button) {
    button.addEventListener('click', function () {
      var kind = button.getAttribute('data-insert');

      if (kind === 'video-upload') {
        el.videoFile.click();
        return;
      }

      if (kind === 'video') {
        var input = global.prompt('粘贴视频地址：B 站 / YouTube 直接用页面链接，直链需以 .mp4 / .webm 结尾', 'https://');
        if (input === null) return;

        var url = input.trim();
        if (!/^https?:\/\//i.test(url)) {
          Admin.toast('地址需要以 http:// 或 https:// 开头', true);
          return;
        }

        insertAtCursor('@video ' + url);
        Admin.toast('已插入视频，右侧可直接预览');
        return;
      }

      if (kind === 'image') {
        el.contentFile.click();
        return;
      }

      if (kind === 'code') {
        insertAtCursor(SNIPPETS.code, 6);
        return;
      }

      insertAtCursor(SNIPPETS[kind]);
    });
  });

  /* ---------------------------- 图片上传 ---------------------------- */

  function uploadAndInsert(file) {
    Admin.toast('正在上传图片…');

    Admin.upload(file)
      .then(function (item) {
        var alt = String(item.originalName || '图片').replace(/\.[^.]+$/, '') || '图片';
        insertAtCursor('![' + alt + '](' + item.url + ')');
        Admin.toast('图片已插入');
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  }

  el.contentFile.addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (file) uploadAndInsert(file);
  });

  el.videoFile.addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;

    Admin.toast('正在上传视频…');

    Admin.uploadVideo(file, function (percent) {
      if (percent !== null) Admin.toast('正在上传视频 ' + percent + '%');
    })
      .then(function (item) {
        insertAtCursor('@video ' + item.url);
        Admin.toast('视频已插入（' + Admin.formatSize(item.size) + '）');
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  });

  // 直接粘贴截图
  el.content.addEventListener('paste', function (event) {
    var items = (event.clipboardData && event.clipboardData.items) || [];
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].type.indexOf('image/') === 0) {
        var file = items[i].getAsFile();
        if (file) {
          event.preventDefault();
          uploadAndInsert(file);
          return;
        }
      }
    }
  });

  function setCover(url) {
    coverUrl = url || '';
    el.coverName.textContent = coverUrl ? coverUrl.split('/').pop().slice(0, 12) + '…' : '';
    el.clearCover.hidden = !coverUrl;

    if (coverUrl) {
      el.coverPreview.src = coverUrl;
      el.coverPreview.hidden = false;
    } else {
      el.coverPreview.removeAttribute('src');
      el.coverPreview.hidden = true;
    }
  }

  el.pickCover.addEventListener('click', function () {
    el.coverFile.click();
  });

  el.coverFile.addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;

    Admin.toast('正在上传封面…');
    Admin.upload(file)
      .then(function (item) {
        setCover(item.url);
        dirty = true;
        Admin.toast('封面已设置');
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  });

  el.clearCover.addEventListener('click', function () {
    setCover('');
    dirty = true;
  });

  /* ---------------------------- 保存 ---------------------------- */

  function payload(status) {
    return {
      title: el.title.value.trim(),
      slug: el.slug.value.trim(),
      summary: el.summary.value.trim(),
      contentMd: el.content.value,
      categoryId: /^\d+$/.test(el.category.value) ? Number(el.category.value) : null,
      coverImage: coverUrl || null,
      isTop: el.isTop.checked,
      // datetime-local 的值形如 2026-10-25T09:30，服务端会归一化成 DATETIME
      publishAt: el.publishAt.value || null,
      status: status
    };
  }

  function validate() {
    if (!el.title.value.trim()) {
      Admin.toast('标题不能为空', true);
      el.title.focus();
      return false;
    }
    if (!el.content.value.trim()) {
      Admin.toast('正文不能为空', true);
      el.content.focus();
      return false;
    }
    return true;
  }

  function save(status) {
    if (saving) return;
    if (!validate()) return;

    saving = true;
    el.saveDraft.disabled = true;
    el.publish.disabled = true;
    el.saveState.textContent = '保存中…';

    var body = payload(status);
    var action = articleId
      ? Admin.put('/articles/' + articleId, body)
      : Admin.post('/articles', body);

    action
      .then(function (data) {
        articleId = data.id || articleId;
        currentStatus = body.status;
        dirty = false;

        global.history.replaceState(null, '', '/admin/editor.html?id=' + articleId);
        syncButtons();

        el.saveState.textContent = '已保存 · ' + new Date().toLocaleTimeString();

        var scheduled = body.status === 1 && body.publishAt && new Date(body.publishAt) > new Date();
        Admin.toast(scheduled ? '已排期，到时间会自动发布' : (body.status ? '已发布' : '已保存为草稿'));
      })
      .catch(function (err) {
        el.saveState.textContent = '保存失败';
        Admin.toast(err.message, true);
      })
      .then(function () {
        saving = false;
        el.saveDraft.disabled = false;
        el.publish.disabled = false;
      });
  }

  function syncButtons() {
    el.saveDraft.textContent = currentStatus ? '保存' : '存为草稿';
    el.publish.textContent = currentStatus ? '更新发布' : '保存并发布';
    if (articleId) el.pageTitle.textContent = '编辑文章';
  }

  el.saveDraft.addEventListener('click', function () {
    // 已发布的文章点这里保持发布状态，避免误把线上文章转成草稿
    save(currentStatus);
  });

  el.publish.addEventListener('click', function () {
    save(1);
  });

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save(currentStatus);
    }
  });

  [el.title, el.slug, el.summary, el.content, el.isTop, el.publishAt].forEach(function (node) {
    node.addEventListener('input', function () {
      dirty = true;
    });
    node.addEventListener('change', function () {
      dirty = true;
    });
  });

  el.content.addEventListener('input', schedulePreview);

  global.addEventListener('beforeunload', function (event) {
    if (!dirty) return undefined;
    event.preventDefault();
    event.returnValue = '';
    return '';
  });

  /* ---------------------------- 初始化 ---------------------------- */

  Admin.get('/taxonomy')
    .then(function (data) {
      categories = data.categories || [];
      // 文章可能比分类先回来，用 pendingCategoryId 兜住
      renderCategories(pendingCategoryId === null ? lastCategoryId : String(pendingCategoryId));
    })
    .catch(function () {});

  if (articleId) {
    Admin.get('/articles/' + articleId)
      .then(function (article) {
        el.title.value = article.title;
        el.slug.value = article.slug;
        el.summary.value = article.summary || '';
        el.content.value = article.contentMd || '';
        el.isTop.checked = Boolean(article.isTop);
        el.publishAt.value = article.publishedAt
          ? String(article.publishedAt).slice(0, 16).replace(' ', 'T')
          : '';
        currentStatus = article.status;
        setCover(article.coverImage);

        if (article.categoryId) {
          pendingCategoryId = article.categoryId;
          renderCategories(article.categoryId);
        }

        el.pageTitle.textContent = '编辑文章';
        el.saveState.textContent = '最后更新 ' + Admin.formatDateTime(article.updatedAt);

        syncButtons();
        renderPreview();
        dirty = false;
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  } else {
    syncButtons();
  }

  document.getElementById('logout').addEventListener('click', function (event) {
    event.preventDefault();
    if (dirty && !global.confirm('有未保存的修改，确定退出？')) return;
    Admin.logout().then(function () {
      global.location.replace('/admin/login.html');
    });
  });
})(window, document);
