'use strict';

/**
 * 访客账号接口：
 *   POST /api/auth/register  { username, password, nickname? }
 *   POST /api/auth/login     { username, password }
 *   POST /api/auth/logout
 *   GET  /api/auth/me        → { user } 或 { user: null }（不返回 401，避免控制台噪音）
 */

const express = require('express');

const env = require('../config/env');
const users = require('../services/users');
const cookies = require('../utils/cookies');
const logger = require('../utils/logger');
const { ok, AppError, CODES } = require('../utils/response');
const { text } = require('../utils/validate');

const router = express.Router();

const MAX_FAILS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const fails = new Map();

function clientIp(req) {
  return (req.ip || '').replace(/^::ffff:/, '').slice(0, 45) || 'unknown';
}

function failKey(req, username) {
  return `${clientIp(req)}|${String(username || '').toLowerCase()}`;
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

function setSessionCookie(req, res, token) {
  res.setHeader(
    'Set-Cookie',
    cookies.serialize(users.COOKIE_NAME, token, {
      maxAge: users.SESSION_TTL_MS / 1000,
      httpOnly: true,
      sameSite: 'Lax',
      // 与后台一致：只有生产环境且真的走 HTTPS 时才加 Secure
      secure: env.isProduction && req.secure,
    })
  );
}

router.get('/me', (req, res) => {
  ok(res, { user: req.user || null });
});

router.post('/register', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = text(body.username, 'username', { max: 20 });
  const plain = text(body.password, 'password', { max: 200 });
  const nickname = text(body.nickname, 'nickname', { required: false, max: 20 });

  const user = await users.register({ username, password: plain, nickname });
  const session = await users.createSession(user.id);

  setSessionCookie(req, res, session.token);
  logger.info('user_registered', { reqId: req.id, userId: user.id, ip: clientIp(req) });

  ok(res, { user }, '注册成功');
});

router.post('/login', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = text(body.username, 'username', { max: 20 });
  const plain = text(body.password, 'password', { max: 200 });

  const key = failKey(req, username);
  if (blocked(key)) {
    throw new AppError(CODES.TOO_MANY_REQUESTS, '登录尝试过于频繁，请 10 分钟后再试');
  }

  const user = await users.verifyLogin(username, plain);
  if (!user) {
    recordFail(key);
    logger.warn('user_login_failed', { reqId: req.id, username, ip: clientIp(req) });
    throw new AppError(CODES.LOGIN_FAILED, '用户名或密码不正确');
  }

  fails.delete(key);

  const session = await users.createSession(user.id);
  setSessionCookie(req, res, session.token);
  logger.info('user_login', { reqId: req.id, userId: user.id, ip: clientIp(req) });

  ok(res, { user }, '登录成功');
});

router.post('/logout', async (req, res) => {
  const token = cookies.parse(req.headers.cookie)[users.COOKIE_NAME];
  if (token) await users.destroySession(token);

  res.setHeader('Set-Cookie', cookies.serialize(users.COOKIE_NAME, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax' }));
  ok(res, null, '已退出登录');
});

module.exports = router;
