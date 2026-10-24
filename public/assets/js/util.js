/**
 * 通用工具：转义、取参、时间格式化、状态渲染、代码块复制。
 * 无第三方依赖，全部挂在 window.BlogUtil。
 */
(function (global, document) {
  'use strict';

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ESCAPES[ch];
    });
  }

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function qs(name) {
    var match = new RegExp('[?&]' + name + '=([^&]*)').exec(global.location.search);
    if (!match) return '';
    try {
      return decodeURIComponent(match[1].replace(/\+/g, ' '));
    } catch (err) {
      return '';
    }
  }

  function formatDate(value) {
    return String(value || '').slice(0, 10);
  }

  /** 手动解析 'YYYY-MM-DD HH:mm:ss'，避免各浏览器对 Date 解析的差异 */
  function parseDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(value || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  }

  function relativeTime(value) {
    var date = parseDate(value);
    if (!date) return formatDate(value);

    var diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 0) return formatDate(value);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' 天前';
    return formatDate(value);
  }

  /**
   * 空态 / 错误态。
   * opts: { title, message, retry }
   */
  function showState(container, opts) {
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    var options = opts || {};
    el.innerHTML =
      '<div class="state">' +
      (options.title ? '<strong>' + escapeHtml(options.title) + '</strong>' : '') +
      (options.message ? escapeHtml(options.message) : '') +
      (options.retry ? '<br><button class="btn btn-ghost" type="button" data-retry>重试</button>' : '') +
      '</div>';

    if (options.retry) {
      var button = el.querySelector('[data-retry]');
      if (button) button.addEventListener('click', options.retry);
    }
  }

  /** 代码块复制按钮：默认淡入隐藏（CSS 控制），点击后给出成功反馈 */
  function attachCopyButtons(root) {
    $$('.code-block', root || document).forEach(function (block) {
      var head = block.querySelector('.code-head');
      var code = block.querySelector('code');
      if (!head || !code || head.querySelector('.copy-btn')) return;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-btn';
      button.textContent = '复制';
      button.setAttribute('aria-label', '复制代码');

      button.addEventListener('click', function () {
        var text = code.textContent || '';

        function done() {
          button.textContent = '已复制';
          button.classList.add('is-copied');
          global.setTimeout(function () {
            button.textContent = '复制';
            button.classList.remove('is-copied');
          }, 1600);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {
            button.textContent = '复制失败';
          });
          return;
        }

        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
          done();
        } catch (err) {
          button.textContent = '复制失败';
        }
        document.body.removeChild(area);
      });

      head.appendChild(button);
    });
  }

  global.BlogUtil = {
    escapeHtml: escapeHtml,
    $: $,
    $$: $$,
    qs: qs,
    formatDate: formatDate,
    parseDate: parseDate,
    relativeTime: relativeTime,
    showState: showState,
    attachCopyButtons: attachCopyButtons
  };
})(window, document);
