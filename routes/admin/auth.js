'use strict';

/**
 * 后台登录：POST /login、POST /logout、GET /me
 *
 * 会话方案：随机 token（32 字节）放 HttpOnly Cookie，库里只存 sha256(token)。
 *  - HttpOnly  → 前端 JS 拿不到，XSS 也偷不走
 *  - SameSite  → Lax，跨站 POST 不会带上 Cookie
 *  - 服务端可删 → 登出、改密码后强制下线都成立（这是纯 JWT 做不到的）
 */

const crypto = require('crypto');
const express = require('express');

const db = require('../../db');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const cookies = require('../../utils/cookies');
const password = require('../../utils/password');
const { ok, AppError, CODES } = require('../../utils/response');
const { text } = require('../../utils/validate');
const requireAdmin = require('../../middlewares/require-admin');

const { COOKIE_NAME, hashToken } = requireAdmin;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;

// 单进程内存计数即可：后台只有一个入口，重启丢失计数无伤大雅
const fails = new Map();

function failKey(req, username) {
  return `${req.ip || '-'}|${String(username || '').toLowerCase()}`;
}

function blocked(key) {
  const entry = fails.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    fails.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILS;
}

function recordFail(key) {
  const entry = fails.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    fails.set(key, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

function clientIp(req) {
  return (req.ip || '').replace(/^::ffff:/, '').slice(0, 45) || null;
}

const router = express.Router();

router.post('/login', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = text(body.username, 'username', { max: 50 });
  const plain = text(body.password, 'password', { max: 200 });

  const key = failKey(req, username);
  if (blocked(key)) {
    throw new AppError(CODES.TOO_MANY_REQUESTS, '登录尝试过于频繁，请 10 分钟后再试');
  }

  const admin = await db.queryOne('SELECT id, username, password_hash FROM admins WHERE username = ? LIMIT 1', [username]);
  const passed = Boolean(admin) && password.verify(plain, admin.password_hash);

  if (!passed) {
    recordFail(key);
    logger.warn('admin_login_failed', { reqId: req.id, username, ip: clientIp(req) });
    throw new AppError(CODES.LOGIN_FAILED, '账号或密码不正确');
  }

  fails.delete(key);

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.query(
    'INSERT INTO admin_sessions (admin_id, token_hash, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
    [admin.id, hashToken(token), clientIp(req), (req.get('user-agent') || '').slice(0, 200) || null, expiresAt]
  );

  db.query('UPDATE admins SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?', [clientIp(req), admin.id]).catch(() => {});
  db.query('DELETE FROM admin_sessions WHERE expires_at < NOW()').catch(() => {});

  res.setHeader(
    'Set-Cookie',
    cookies.serialize(COOKIE_NAME, token, {
      maxAge: SESSION_TTL_MS / 1000,
      httpOnly: true,
      sameSite: 'Lax',
      // 只在「生产 + 真的走 HTTPS」时加 Secure，否则本地 http 调试 Cookie 会被浏览器丢掉
      secure: env.isProduction && req.secure,
    })
  );

  logger.info('admin_login', { reqId: req.id, adminId: admin.id, ip: clientIp(req) });
  ok(res, { username: admin.username, expiresAt: expiresAt.toISOString() }, '登录成功');
});

router.post('/logout', async (req, res) => {
  const token = cookies.parse(req.headers.cookie)[COOKIE_NAME];

  if (token) {
    await db.query('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]);
  }

  res.setHeader('Set-Cookie', cookies.serialize(COOKIE_NAME, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax' }));
  ok(res, null, '已退出登录');
});

router.get('/me', requireAdmin, (req, res) => {
  ok(res, { id: req.admin.id, username: req.admin.username });
});

module.exports = router;
