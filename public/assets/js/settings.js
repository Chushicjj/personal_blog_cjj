/**
 * 站点设置：从 /api/settings 读取后台配置，合并进 window.BLOG_CONFIG。
 *
 * 加载顺序：config.js（兜底默认值）→ settings.js（覆盖真实值）→ shell.js（等 Promise 再渲染）
 * 接口不可用或超时 2 秒就静默用兜底值，绝不让页面因为一个配置接口卡住。
 */
(function (global, document) {
  'use strict';

  var config = global.BLOG_CONFIG || (global.BLOG_CONFIG = {});
  var FIELDS = ['siteName', 'author', 'tagline', 'since', 'github', 'email', 'avatar'];
  var TIMEOUT_MS = 2000;

  function initials(name) {
    var text = String(name || '').trim();
    return text ? text.slice(0, 2).toUpperCase() : '·';
  }

  /**
   * 头像：有图就显示图，没图就显示作者名首字母。
   * 这样后台还没传头像时，关于页也不会出现裂图或空洞。
   */
  function applyAvatar() {
    var wrap = document.querySelector('[data-avatar]');
    if (!wrap) return;

    var img = wrap.querySelector('img');
    var fallback = wrap.querySelector('.about-avatar-initial');
    var author = config.author || config.siteName || '';

    if (!img) return;

    if (config.avatar) {
      img.src = config.avatar;
      img.alt = (author || '头像') + ' 的头像';
      img.hidden = false;
      if (fallback) fallback.hidden = true;
      return;
    }

    img.removeAttribute('src');
    img.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = initials(author);
    }
  }

  function applyToDom() {
    var map = {
      '[data-site-name]': config.siteName,
      '[data-author]': config.author,
      '[data-tagline]': config.tagline
    };

    Object.keys(map).forEach(function (selector) {
      if (!map[selector]) return;
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (node) {
        node.textContent = map[selector];
      });
    });

    applyAvatar();
  }

  function fallback() {
    applyToDom();
    return config;
  }

  if (typeof global.fetch !== 'function') {
    global.BLOG_SETTINGS_READY = Promise.resolve(fallback());
    return;
  }

  var timeout = new Promise(function (resolve) {
    global.setTimeout(function () {
      resolve(null);
    }, TIMEOUT_MS);
  });

  var fetched = global
    .fetch('/api/settings', { headers: { Accept: 'application/json' } })
    .then(function (response) {
      return response.json();
    })
    .then(function (payload) {
      if (!payload || payload.code !== 0 || !payload.data) return null;

      FIELDS.forEach(function (key) {
        var value = payload.data[key];
        if (value !== undefined && value !== null && value !== '') config[key] = value;
      });

      return config;
    })
    .catch(function () {
      return null;
    });

  global.BLOG_SETTINGS_READY = Promise.race([fetched, timeout]).then(function (result) {
    if (!result) return fallback();
    applyToDom();
    return result;
  });
})(window, document);
