'use strict';

/**
 * 博客后端入口（Express 5 + CommonJS）。
 *
 * 只做装配，不写业务：
 *   环境变量 -> 请求日志 -> JSON 解析 -> 业务路由 -> 静态资源 -> 404 -> 全局错误处理 -> 启动/优雅退出
 *
 * 业务面共有四块：
 *   /api/messages  留言板（公开）
 *   /api/articles  文章接口（公开）
 *   /api/admin/*   后台管理（登录后可用）
 *   /posts/:slug   文章页服务端直出
 *
 * 静态资源由本进程托管只是为了「本地联调 + 容器自检」方便；
 * 生产环境由 Nginx 直接托管 public/ 下的同一份文件，本进程主要提供 /api、/media 与 /posts。
 */

const path = require('path');
const express = require('express');

const env = require('./config/env');
const logger = require('./utils/logger');
const db = require('./db');
const requestLog = require('./middlewares/request-log');
const notFound = require('./middlewares/not-found');
const errorHandler = require('./middlewares/error-handler');
const routes = require('./routes');

const app = express();

app.disable('x-powered-by');
// 反代后取真实客户端 IP（只信任回环地址来的 X-Forwarded-For）
app.set('trust proxy', 'loopback');

// 基础安全响应头。没有上 CSP：模板里有内联的主题脚本，加 CSP 得先改造渲染方式，
// 收益不如明确写上这几个直接有效的头。
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // 只有真的走 HTTPS 才发 HSTS，本地 http 调试带上会让浏览器日后强制跳转
  if (env.isProduction && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
});

app.use(requestLog);
app.use(express.json({ limit: '1mb' }));

app.use(routes);

// 上传的视频：磁盘静态文件，express.static 自带 Accept-Ranges，浏览器才能拖动进度条
app.use('/uploads', express.static(env.upload.dir, {
  maxAge: '365d',
  immutable: true,
  etag: true,
  index: false,
  dotfiles: 'ignore',
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

// 浏览器默认会请求 /favicon.ico，直接指到 svg，避免落到 404
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

app.use(express.static(path.join(env.root, 'public'), { extensions: ['html'], etag: true, maxAge: 0 }));

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.server.port, () => {
  logger.info('server_started', {
    port: env.server.port,
    env: env.nodeEnv,
    pid: process.pid,
    dbHost: env.db.host,
    dbPort: env.db.port,
    dbName: env.db.database,
    dbTimezone: env.db.timezone,
  });

  // 启动即探一次库：连不上立刻在日志里看到，不必等第一个请求才发现
  db.ping(3000)
    .then((latencyMs) => logger.info('db_ready', { latencyMs }))
    .catch((err) => logger.error('db_unavailable_at_startup', logger.serializeError(err)));
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('shutdown_begin', { signal });

  const forceExit = setTimeout(() => {
    logger.error('shutdown_timeout', { timeoutMs: 10000 });
    process.exit(1);
  }, 10000);
  forceExit.unref();

  server.close(async () => {
    try {
      await db.close();
    } catch (err) {
      logger.warn('db_close_failed', logger.serializeError(err));
    }
    logger.info('shutdown_done');
    logger.close();
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => shutdown(signal));
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', {
    detail: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', logger.serializeError(err));
  // 进程状态已不可信，交给 Docker 的 restart: always 拉起
  process.exit(1);
});

module.exports = app;
