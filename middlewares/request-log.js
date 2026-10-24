'use strict';

/**
 * 访问日志：每个请求一行 JSON，带 reqId 串联请求与错误日志。
 * 同时把 reqId 回写到 X-Request-Id 响应头，线上排查时让用户直接报这个编号即可。
 */

const crypto = require('crypto');

const logger = require('../utils/logger');

const SLOW_REQUEST_MS = 1000;

module.exports = function requestLog(req, res, next) {
  const startedAt = process.hrtime.bigint();
  const incoming = req.get('X-Request-Id');

  req.id = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);

  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('request', {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms,
      ip: req.ip,
      ua: (req.get('user-agent') || '').slice(0, 120),
    });

    if (ms >= SLOW_REQUEST_MS) {
      logger.warn('slow_request', { reqId: req.id, path: req.originalUrl, ms });
    }
  });

  next();
};
