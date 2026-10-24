/**
 * 页面外壳：主题切换、大圆光标、移动端菜单、回到顶部、页脚元信息、代码复制按钮。
 * 主题的无闪烁初始化在 HTML head 的内联脚本里完成。
 */
(function (global, document) {
  'use strict';

  var CONFIG = global.BLOG_CONFIG || {};
  var THEME_KEY = 'blog-theme';
  var root = document.documentElement;
  var reduceMotion =
    Boolean(global.matchMedia) && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------ 主题 ------------------------------ */

  // 三态：未选择 = 跟随系统；选过就固定，直到再点回「跟随系统」
  var MODE_LABEL = { auto: '跟随系统', dark: '深色', light: '浅色' };

  function systemTheme() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function currentMode() {
    try {
      var saved = global.localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (err) {
      /* 隐私模式下读不到，按跟随系统处理 */
    }
    return 'auto';
  }

  function effectiveTheme(mode) {
    return mode === 'auto' ? systemTheme() : mode;
  }

  function applyTheme(mode, animate) {
    var theme = effectiveTheme(mode);

    if (animate) {
      root.classList.add('theme-anim');
      global.setTimeout(function () {
        root.classList.remove('theme-anim');
      }, 430);
    }
    root.setAttribute('data-theme', theme);

    var label = document.getElementById('theme-label');
    var button = document.getElementById('theme-toggle');
    var meta = document.querySelector('meta[name="theme-color"]');

    if (label) label.textContent = MODE_LABEL[mode];
    if (button) {
      button.setAttribute('aria-label', '主题：' + MODE_LABEL[mode] + '，点击切换');
      button.setAttribute('aria-pressed', mode === 'auto' ? 'false' : 'true');
      button.setAttribute('title', '跟随系统 → 深色 → 浅色');
    }
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c0b09' : '#fdfbf7');
  }

  function saveMode(mode) {
    try {
      // auto 不落盘：清掉键值就回到跟随系统
      if (mode === 'auto') global.localStorage.removeItem(THEME_KEY);
      else global.localStorage.setItem(THEME_KEY, mode);
    } catch (err) {
      /* 存不了不影响当前会话 */
    }
  }

  function initTheme() {
    var mode = currentMode();
    applyTheme(mode, false);

    // 系统主题变了就跟着变——但只在用户没手动选过的时候
    if (global.matchMedia) {
      var query = global.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (currentMode() === 'auto') applyTheme('auto', !reduceMotion);
      };

      if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
      else if (typeof query.addListener === 'function') query.addListener(onChange);
    }

    var button = document.getElementById('theme-toggle');
    if (!button) return;

    button.addEventListener('click', function () {
      var next = currentMode() === 'auto' ? 'dark' : currentMode() === 'dark' ? 'light' : 'auto';
      saveMode(next);
      applyTheme(next, !reduceMotion);
    });
  }

  /* ---------------------------- 移动端菜单 ---------------------------- */

  function initMenu() {
    var button = document.getElementById('menu-toggle');
    var menu = document.getElementById('mobile-menu');
    if (!button || !menu) return;

    function close() {
      menu.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = '菜单';
    }

    button.addEventListener('click', function () {
      var open = !menu.classList.contains('is-open');
      menu.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      button.textContent = open ? '关闭' : '菜单';
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') close();
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('a')) close();
    });

    global.addEventListener('resize', function () {
      if (global.innerWidth > 900) close();
    });
  }

  /* ---------------------------- 大圆光标 ---------------------------- */

  /* ---------------------------- 首屏挖空 ---------------------------- */

  /**
   * 参考 mimo 官网：默认只显示英文标题；
   * 鼠标进入 hero 后从指针位置浮出一个黑圆，圆内显示中文（白字挖空）。
   * 圆的中心用 CSS 变量 --mx / --my 驱动，圆与裁切层共用同一组变量。
   */
  function initHeroReveal() {
    var hero = document.querySelector('.hero');
    if (!hero) return;

    // 圆内底纹 = 同一批字母克隆两份，行距减半，做出「透镜」的加密效果
    var lens = hero.querySelector('.hero-lens');
    var pattern = hero.querySelector('.hero-pattern');
    if (lens && pattern && !lens.firstChild) {
      var rows = pattern.querySelectorAll('span');
      for (var round = 0; round < 2; round += 1) {
        for (var i = 0; i < rows.length; i += 1) {
          lens.appendChild(rows[i].cloneNode(true));
        }
      }
    }

    var targetX = 0;
    var targetY = 0;
    var currentX = 0;
    var currentY = 0;
    var lerping = false;

    function apply(x, y) {
      hero.style.setProperty('--mx', x + 'px');
      hero.style.setProperty('--my', y + 'px');
    }

    function step() {
      currentX += (targetX - currentX) * 0.22;
      currentY += (targetY - currentY) * 0.22;
      apply(currentX, currentY);

      if (Math.abs(targetX - currentX) < 0.6 && Math.abs(targetY - currentY) < 0.6) {
        lerping = false;
        apply(targetX, targetY);
        return;
      }
      global.requestAnimationFrame(step);
    }

    hero.addEventListener(
      'mousemove',
      function (event) {
        if (hero.classList.contains('is-flipped')) return;
        var rect = hero.getBoundingClientRect();
        targetX = event.clientX - rect.left;
        targetY = event.clientY - rect.top;

        if (!hero.classList.contains('is-hovering')) {
          currentX = targetX;
          currentY = targetY;
          apply(currentX, currentY);
          hero.classList.add('is-hovering');
          return;
        }

        if (reduceMotion) {
          apply(targetX, targetY);
          return;
        }

        if (!lerping) {
          lerping = true;
          global.requestAnimationFrame(step);
        }
      },
      { passive: true }
    );

    hero.addEventListener('mouseleave', function () {
      hero.classList.remove('is-hovering');
    });
  }

  /* ------------------------- 双击翻转卡片 ------------------------- */

  /**
   * 关于卡片：双击绕横轴中线翻面（正面中文 / 背面英文）。
   * 同时支持键盘 Enter / Space，方便无鼠标操作。
   */
  function initFlip() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-flip]'), function (card) {
      function toggle() {
        var flipped = card.classList.toggle('is-flipped');
        card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
        var selection = global.getSelection && global.getSelection();
        if (selection) selection.removeAllRanges();
      }

      card.addEventListener('dblclick', toggle);
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  /* ---------------------------- 回到顶部 ---------------------------- */

  function initToTop() {
    var button = document.getElementById('to-top');
    if (!button) return;

    button.addEventListener('click', function () {
      global.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------- 页脚与社交链接 ------------------------- */

  function initMeta() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (node) {
      node.textContent = String(new Date().getFullYear());
    });

    var since = document.querySelector('[data-since]');
    if (since) since.textContent = CONFIG.since || '';

    Array.prototype.forEach.call(document.querySelectorAll('[data-social]'), function (link) {
      var kind = link.getAttribute('data-social');
      if (kind === 'github') {
        if (!CONFIG.github) {
          link.hidden = true;
          return;
        }
        link.href = CONFIG.github;
      }
      if (kind === 'email') {
        if (!CONFIG.email) {
          link.hidden = true;
          return;
        }
        link.href = 'mailto:' + CONFIG.email;
      }
    });
  }

  /**
   * 页头透明悬浮：静止时完全透明，内容从下方透上来；
   * 一旦滚动就让内容压到导航上了，必须补一层毛玻璃，否则文字糊在一起。
   */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;

    var ticking = false;

    function sync() {
      header.classList.toggle('is-scrolled', global.scrollY > 8);
      ticking = false;
    }

    global.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      global.requestAnimationFrame(sync);
    }, { passive: true });

    sync();
  }

  /* ------------------------------ 图片放大 ------------------------------ */

  /**
   * 正文图片点击放大。只在 .article-body 里生效，
   * 包在链接里的图不接管（那多半是想跳转到别处）。
   */
  function initLightbox() {
    var box = null;
    var image = null;

    function onKey(event) {
      if (event.key === 'Escape') close();
    }

    function close() {
      if (!box) return;
      box.classList.remove('is-open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }

    function build() {
      box = document.createElement('div');
      box.className = 'lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', '图片预览，按 Esc 关闭');

      image = document.createElement('img');
      box.appendChild(image);

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'lightbox-close';
      closeBtn.setAttribute('aria-label', '关闭');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', close);
      box.appendChild(closeBtn);

      // 点背景关闭；点图片本身不关，避免手滑
      box.addEventListener('click', function (event) {
        if (event.target === box) close();
      });

      document.body.appendChild(box);
    }

    function open(source) {
      if (!box) build();
      image.src = source.currentSrc || source.src;
      image.alt = source.alt || '';
      box.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKey);
    }

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== 'function') return;

      var img = target.closest('.article-body img');
      if (!img || img.closest('a')) return;

      event.preventDefault();
      open(img);
    });
  }

  function boot() {
    initTheme();
    initHeader();
    initMenu();
    initHeroReveal();
    initFlip();
    initToTop();
    initMeta();
    initLightbox();
    global.BlogUtil.attachCopyButtons(document);
  }

  /**
   * 站点名/作者/简介来自 /api/settings（见 settings.js）。
   * 等它落地再渲染，避免页面上先闪一下写死的默认文案；
   * 接口超时的情况下 settings.js 自己会 resolve，这里不会卡住。
   */
  function start() {
    var ready = global.BLOG_SETTINGS_READY;

    if (ready && typeof ready.then === 'function') {
      ready.then(boot, boot);
    } else {
      boot();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window, document);
