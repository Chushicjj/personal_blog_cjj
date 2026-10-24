(function (global, document) {
  'use strict';

  var Admin = global.Admin;
  var esc = Admin.escapeHtml;

  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var countEl = document.getElementById('count');
  var usageEl = document.getElementById('usage');
  var moreBtn = document.getElementById('more');
  var zone = document.getElementById('upload-zone');
  var fileInput = document.getElementById('file-input');
  var videoRows = document.getElementById('video-rows');
  var videoEmpty = document.getElementById('video-empty');
  var videoSummary = document.getElementById('video-summary');

  var PAGE_SIZE = 24;
  var state = { page: 0, totalPages: 0, total: 0, loading: false };

  function cardHtml(item) {
    return (
      '<div class="media-card" data-id="' + item.id + '" data-url="' + esc(item.url) + '">' +
        '<div class="media-thumb">' +
          '<img src="' + esc(item.url) + '" alt="' + esc(item.originalName) + '" loading="lazy">' +
        '</div>' +
        '<div class="media-info">' +
          '<span>' + Admin.formatSize(item.size) + '</span>' +
          '<span>' +
            '<button type="button" data-action="copy">复制链接</button> · ' +
            '<button type="button" data-action="delete">删除</button>' +
          '</span>' +
        '</div>' +
      '</div>'
    );
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;

    if (reset) {
      state.page = 0;
      grid.innerHTML = '';
      empty.hidden = true;
    }

    moreBtn.disabled = true;
    moreBtn.textContent = '加载中…';

    Admin.get('/media?page=' + (state.page + 1) + '&pageSize=' + PAGE_SIZE)
      .then(function (data) {
        state.page += 1;
        state.total = data.pagination.total;
        state.totalPages = data.pagination.totalPages;

        grid.insertAdjacentHTML('beforeend', data.list.map(cardHtml).join(''));
        usageEl.textContent = '共 ' + data.pagination.total + ' 张 · 占用 ' + Admin.formatSize(data.bytes);

        empty.hidden = Boolean(data.list.length) || state.page > 1;
        moreBtn.hidden = state.page >= state.totalPages;
        countEl.textContent = data.pagination.total ? '已显示 ' + grid.children.length + ' / ' + data.pagination.total : '';
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

  function uploadFiles(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (file) {
      return file && file.type.indexOf('image/') === 0;
    });

    if (!list.length) {
      Admin.toast('请选择图片文件', true);
      return;
    }

    var queue = list.slice();
    var done = 0;

    function next() {
      var file = queue.shift();
      if (!file) {
        Admin.toast('上传完成：' + done + ' 张');
        load(true);
        return;
      }

      Admin.upload(file)
        .then(function () {
          done += 1;
        })
        .catch(function (err) {
          Admin.toast(file.name + '：' + err.message, true);
        })
        .then(next);
    }

    Admin.toast('开始上传 ' + queue.length + ' 张…');
    next();
  }

  zone.addEventListener('click', function () {
    fileInput.click();
  });

  zone.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', function () {
    uploadFiles(this.files);
    this.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    zone.addEventListener(name, function (event) {
      event.preventDefault();
      zone.classList.add('is-over');
    });
  });

  ['dragleave', 'drop'].forEach(function (name) {
    zone.addEventListener(name, function (event) {
      event.preventDefault();
      zone.classList.remove('is-over');
    });
  });

  zone.addEventListener('drop', function (event) {
    if (event.dataTransfer && event.dataTransfer.files) {
      uploadFiles(event.dataTransfer.files);
    }
  });

  grid.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var card = button.closest('.media-card');
    var id = Number(card.getAttribute('data-id'));
    var url = card.getAttribute('data-url');

    if (button.getAttribute('data-action') === 'copy') {
      var absolute = global.location.origin + url;

      function done() {
        Admin.toast('链接已复制：' + absolute);
      }

      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(absolute).then(done).catch(function () {
          global.prompt('手动复制链接', absolute);
        });
        return;
      }
      global.prompt('手动复制链接', absolute);
      return;
    }

    if (!global.confirm('删除这张图片？被文章引用的图片会提示确认。')) return;

    button.disabled = true;

    Admin.del('/media/' + id)
      .then(function () {
        Admin.toast('已删除');
        load(true);
      })
      .catch(function (err) {
        // 40900 = 仍被文章引用，二次确认后强制删除
        if (err.code === 40900 && global.confirm(err.message + '\n\n强制删除会让文章里的图片变成裂图，仍要继续？')) {
          Admin.del('/media/' + id + '?force=1')
            .then(function () {
              Admin.toast('已强制删除');
              load(true);
            })
            .catch(function (forceErr) {
              Admin.toast(forceErr.message, true);
              button.disabled = false;
            });
          return;
        }
        button.disabled = false;
      });
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

  /* ---------------------------- 视频列表 ---------------------------- */

  function videoRow(item) {
    return (
      '<tr data-path="' + esc(item.path) + '" data-url="' + esc(item.url) + '">' +
        '<td>' +
          '<span class="cell-title">' + esc(item.name) + '</span>' +
          '<span class="cell-slug">' + esc(item.path) + '</span>' +
        '</td>' +
        '<td class="cell-meta">' + Admin.formatSize(item.size) + '</td>' +
        '<td class="cell-meta">' + esc(item.uploadedAt) + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            '<button type="button" data-video="copy">复制链接</button>' +
            '<button type="button" class="danger" data-video="delete">删除</button>' +
          '</div>' +
        '</td>' +
      '</tr>'
    );
  }

  function loadVideos() {
    Admin.get('/videos')
      .then(function (data) {
        var list = data.list || [];
        videoRows.innerHTML = list.map(videoRow).join('');
        videoEmpty.hidden = list.length > 0;
        videoSummary.textContent = list.length
          ? list.length + ' 个文件 · 共 ' + Admin.formatSize(data.totalBytes)
          : '';
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
      });
  }

  videoRows.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-video]');
    if (!button) return;

    var row = button.closest('tr');
    var path = row.getAttribute('data-path');
    var url = row.getAttribute('data-url');
    var action = button.getAttribute('data-video');

    if (action === 'copy') {
      var absolute = global.location.origin + url;
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(absolute).then(function () {
          Admin.toast('链接已复制：' + absolute);
        }).catch(function () {
          global.prompt('手动复制链接', absolute);
        });
        return;
      }
      global.prompt('手动复制链接', absolute);
      return;
    }

    if (!global.confirm('删除这个视频文件？引用它的文章会出现空白播放器。')) return;

    button.disabled = true;
    Admin.del('/videos?path=' + encodeURIComponent(path))
      .then(function () {
        Admin.toast('已删除');
        loadVideos();
      })
      .catch(function (err) {
        Admin.toast(err.message, true);
        button.disabled = false;
      });
  });

  load(true);
  loadVideos();
})(window, document);
