/**
 * 后台公共脚本：接口封装、提示、格式化。
 *
 * 所有请求都带 credentials: 'same-origin'，会话靠 HttpOnly Cookie，
 * 前端不接触也不存储任何 token。
 */
(function (global) {
  'use strict';

  var BASE = '/api/admin';

  function ApiError(message, status, code) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status || 0;
    this.code = code || 0;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  var LOGIN_PAGE = '/admin/login.html';

  function onLoginPage() {
    return /\/admin\/login\.html$/.test(global.location.pathname);
  }

  function request(path, options) {
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    };

    if (opts.formData) {
      init.body = opts.formData;
    } else if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    return global.fetch(BASE + path, init).then(function (response) {
      return response.text().then(function (text) {
        var payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch (err) {
          payload = null;
        }

        if (response.status === 401) {
          if (!onLoginPage()) global.location.replace(LOGIN_PAGE);
          throw new ApiError((payload && payload.message) || '请重新登录', 401, 40100);
        }

        if (!response.ok || !payload || payload.code !== 0) {
          throw new ApiError(
            (payload && payload.message) || '请求失败（HTTP ' + response.status + '）',
            response.status,
            payload && payload.code
          );
        }

        return payload.data;
      });
    });
  }

  var toastTimer = null;

  function toast(message, isError) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }

    el.textContent = message;
    el.className = 'toast is-show' + (isError ? ' is-error' : '');

    if (toastTimer) global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () {
      el.className = 'toast' + (isError ? ' is-error' : '');
    }, 2600);
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatDate(value) {
    return String(value || '').slice(0, 10);
  }

  function formatDateTime(value) {
    var text = String(value || '');
    return text ? text.slice(0, 16) : '—';
  }

  function formatSize(bytes) {
    var size = Number(bytes) || 0;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / 1024 / 1024).toFixed(2) + ' MB';
  }

  function param(name) {
    var matched = new RegExp('[?&]' + name + '=([^&]*)').exec(global.location.search);
    if (!matched) return '';
    try {
      return decodeURIComponent(matched[1].replace(/\+/g, ' '));
    } catch (err) {
      return '';
    }
  }

  global.Admin = {
    ApiError: ApiError,
    request: request,
    get: function (path) { return request(path); },
    post: function (path, body) { return request(path, { method: 'POST', body: body }); },
    put: function (path, body) { return request(path, { method: 'PUT', body: body }); },
    patch: function (path, body) { return request(path, { method: 'PATCH', body: body }); },
    del: function (path) { return request(path, { method: 'DELETE' }); },
    upload: function (file) {
      var form = new global.FormData();
      form.append('file', file);
      return request('/media/upload', { method: 'POST', formData: form });
    },
    /**
     * 视频上传走 XHR：只有它能拿到 upload.onprogress，几十 MB 的文件
     * 用 fetch 的话界面上只能干等，用户会以为卡死了。
     */
    uploadVideo: function (file, onProgress) {
      return new Promise(function (resolve, reject) {
        var xhr = new global.XMLHttpRequest();
        xhr.open('POST', BASE + '/videos/upload', true);
        xhr.withCredentials = true;

        xhr.upload.onprogress = function (event) {
          if (!onProgress) return;
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          } else {
            onProgress(null);
          }
        };

        xhr.onload = function () {
          var payload = null;
          try {
            payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          } catch (err) {
            payload = null;
          }

          if (xhr.status === 401) {
            if (!onLoginPage()) global.location.replace(LOGIN_PAGE);
            reject(new ApiError('请重新登录', 401, 40100));
            return;
          }

          if (xhr.status >= 200 && xhr.status < 300 && payload && payload.code === 0) {
            resolve(payload.data);
            return;
          }

          reject(new ApiError(
            (payload && payload.message) || '上传失败（HTTP ' + xhr.status + '）',
            xhr.status,
            payload && payload.code
          ));
        };

        xhr.onerror = function () {
          reject(new ApiError('网络中断，上传失败', 0, 0));
        };

        var form = new global.FormData();
        form.append('file', file);
        xhr.send(form);
      });
    },
    logout: function () { return request('/logout', { method: 'POST' }); },
    me: function () { return request('/me'); },
    toast: toast,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatSize: formatSize,
    param: param
  };
})(window);
