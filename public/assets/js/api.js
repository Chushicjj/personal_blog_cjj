/**
 * 留言接口封装：统一处理 { code, message, data }、超时与错误提示。
 * 改造后前端只需要两个接口，其余内容都是静态页面。
 */
(function (global) {
  'use strict';

  var CONFIG = global.BLOG_CONFIG || {};
  var BASE = String(CONFIG.apiBase || '').replace(/\/+$/, '');
  var TIMEOUT = 10000;

  function ApiError(message, status, code, requestId) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status || 0;
    this.code = code || 0;
    this.requestId = requestId || '';
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function buildQuery(params) {
    var pairs = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === '') return;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function request(path, options) {
    var opts = options || {};
    var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, TIMEOUT)
      : null;

    function clear() {
      if (timer) global.clearTimeout(timer);
    }

    var init = {
      method: opts.method || 'GET',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    };

    if (opts.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    return global
      .fetch(BASE + path, init)
      .then(function (response) {
        return response.text().then(function (text) {
          var payload = null;
          try {
            payload = text ? JSON.parse(text) : null;
          } catch (err) {
            payload = null;
          }

          if (!response.ok || !payload || payload.code !== 0) {
            throw new ApiError(
              (payload && payload.message) || '请求失败（HTTP ' + response.status + '）',
              response.status,
              payload && payload.code,
              response.headers.get('X-Request-Id')
            );
          }

          return payload.data;
        });
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') {
          throw new ApiError('请求超时，请稍后重试', 0, 0, '');
        }
        throw err;
      })
      .then(
        function (data) {
          clear();
          return data;
        },
        function (err) {
          clear();
          throw err;
        }
      );
  }

  global.BlogApi = {
    ApiError: ApiError,

    getMessages: function (params) {
      return request('/api/messages' + buildQuery(params));
    },

    createMessage: function (nickname, content) {
      return request('/api/messages', {
        method: 'POST',
        body: { nickname: nickname, content: content }
      });
    }
  };
})(window);
