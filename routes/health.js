'use strict';

/**
 * GET /health —— 服务自身 + 数据库连通性。
 * 数据库不可用时返回 503（code=50300），Docker HEALTHCHECK 与 Nginx 探活据此判定。
 */

const db = require('../db');
const env = require('../config/env');
const logger = require('../utils/logger');
const { CODES, HTTP_STATUS } = require('../utils/response');

module.exports = async function health(req, res) {
  let dbStatus = 'down';
  let latencyMs = null;
  let dbError = null;

  try {
    latencyMs = await db.ping(1500);
    dbStatus = 'up';
  } catch (err) {
    dbError = err.message;
    logger.warn('health_db_unavailable', { reqId: req.id, ...logger.serializeError(err) });
  }

  const healthy = dbStatus === 'up';
  const payload = {
    status: healthy ? 'up' : 'degraded',
    db: {
      status: dbStatus,
      latencyMs,
      ...(dbError ? { error: dbError } : {}),
    },
    uptimeSec: Math.round(process.uptime()),
    version: env.appVersion,
    env: env.nodeEnv,
    timestamp: new Date().toISOString(),
  };

  res.status(healthy ? HTTP_STATUS[CODES.OK] : HTTP_STATUS[CODES.DB_UNAVAILABLE]).json({
    code: healthy ? CODES.OK : CODES.DB_UNAVAILABLE,
    message: healthy ? 'ok' : '数据库连接不可用，服务降级',
    data: payload,
  });
};
