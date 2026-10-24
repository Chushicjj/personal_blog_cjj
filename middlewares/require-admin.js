'use strict';

/**
 * 后台鉴权中间件：Cookie 里的 token → 查 admin_sessions → 确认未过期。
 *
 * 库里只存 token 的 sha256，即使数据库被拖走也不能直接拿去登录。
 * 过期判断用 NOW()，与会话时区（config/env.js 里统一 SET time_zone）保持一致。
 */

const crypto = require('crypto');

const db = require('../db');
const logger = require('../utils/logger');
const cookies = require('../utils/cookies');
const { AppError, CODES } = require('../utils/response');

const COOKIE_NAME = 'blog_admin';
const TOKEN_RE = /^[a-f0-9]{64}$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = async function requireAdmin(req, res, next) {
  try {
    const token = cookies.parse(req.headers.cookie)[COOKIE_NAME];

    if (!token || !TOKEN_RE.test(token)) {
      throw new AppError(CODES.UNAUTHORIZED, '请先登录后台');
    }

    const row = await db.queryOne(
      `SELECT s.id AS session_id, a.id AS admin_id, a.username
         FROM admin_sessions s
         JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.expires_at > NOW()
        LIMIT 1`,
      [hashToken(token)]
    );

    if (!row) {
      throw new AppError(CODES.UNAUTHORIZED, '登录已过期，请重新登录');
    }

    req.admin = { id: row.admin_id, username: row.username, sessionId: row.session_id };

    // 记录活跃时间，不阻塞请求
    db.query('UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = ?', [row.session_id]).catch((err) => {
      logger.warn('admin_session_touch_failed', logger.serializeError(err));
    });

    next();
  } catch (err) {
    next(err);
  }
};

module.exports.COOKIE_NAME = COOKIE_NAME;
module.exports.hashToken = hashToken;
