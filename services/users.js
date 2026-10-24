'use strict';

/**
 * 访客账号：注册、登录校验、会话、后台管理。
 *
 * 会话与后台同构：随机 token 放 HttpOnly Cookie，库里只存 sha256。
 * 两套会话完全隔离（blog_user / blog_admin），互不影响。
 */

const crypto = require('crypto');

const db = require('../db');
const password = require('../utils/password');
const { AppError, CODES } = require('../utils/response');

const COOKIE_NAME = 'blog_user';
const TOKEN_RE = /^[a-f0-9]{64}$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function toPublicUser(row) {
  return { id: Number(row.id), username: row.username, nickname: row.nickname };
}

async function findByUsername(username) {
  return db.queryOne(
    'SELECT id, username, nickname, password_hash, status FROM users WHERE username = ? LIMIT 1',
    [username]
  );
}

async function register({ username, password: plain, nickname }) {
  if (!USERNAME_RE.test(username)) {
    throw new AppError(CODES.BAD_REQUEST, '用户名需 3–20 位，只能包含字母、数字、下划线或短横线');
  }
  if (String(plain || '').length < 8) {
    throw new AppError(CODES.BAD_REQUEST, '密码至少 8 位');
  }

  const exists = await db.queryOne('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
  if (exists) throw new AppError(CODES.CONFLICT, '这个用户名已经被注册了');

  const display = String(nickname || '').trim().slice(0, 20) || username;

  let result;
  try {
    result = await db.query('INSERT INTO users (username, nickname, password_hash) VALUES (?, ?, ?)', [
      username,
      display,
      password.hash(plain),
    ]);
  } catch (err) {
    // 并发注册时唯一索引兜底
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(CODES.CONFLICT, '这个用户名已经被注册了');
    throw err;
  }

  return { id: Number(result.insertId), username, nickname: display };
}

/** 校验账号密码，返回用户行（不含 hash） */
async function verifyLogin(username, plain) {
  const row = await findByUsername(username);
  if (!row) return null;
  if (!password.verify(plain, row.password_hash)) return null;
  if (Number(row.status) !== 1) throw new AppError(CODES.UNAUTHORIZED, '账号已被禁用，请联系站长');
  return toPublicUser(row);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);

  await db.query('INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [
    userId,
    hashToken(token),
    expires,
  ]);

  // 顺手更新最后登录时间，失败不影响登录
  db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]).catch(() => {});

  return { token, expires };
}

async function findSessionUser(token) {
  if (!token || !TOKEN_RE.test(token)) return null;

  const row = await db.queryOne(
    `SELECT s.id AS session_id, u.id, u.username, u.nickname
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.status = 1
      LIMIT 1`,
    [hashToken(token)]
  );

  if (!row) return null;
  return { sessionId: Number(row.session_id), user: toPublicUser(row) };
}

async function destroySession(token) {
  if (!token || !TOKEN_RE.test(token)) return;
  await db.query('DELETE FROM user_sessions WHERE token_hash = ?', [hashToken(token)]);
}

/* ---------------------------- 后台管理 ---------------------------- */

async function list({ page, pageSize, offset, keyword }) {
  const params = [];
  let where = '';

  if (keyword) {
    where = 'WHERE u.username LIKE ? OR u.nickname LIKE ?';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  const totalRow = await db.queryOne(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
  const rows = await db.query(
    `SELECT u.id, u.username, u.nickname, u.status, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM comments c WHERE c.user_id = u.id) AS comment_count
       FROM users u
       ${where}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    list: rows.map((row) => ({
      id: Number(row.id),
      username: row.username,
      nickname: row.nickname,
      status: Number(row.status),
      commentCount: Number(row.comment_count),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    })),
    total: Number(totalRow ? totalRow.total : 0),
  };
}

async function setStatus(id, status) {
  const result = await db.query('UPDATE users SET status = ? WHERE id = ?', [status ? 1 : 0, id]);
  if (result.affectedRows === 0) throw new AppError(CODES.NOT_FOUND, '用户不存在');

  // 禁用后立刻踢掉所有会话，避免已登录的人继续用
  if (!status) await db.query('DELETE FROM user_sessions WHERE user_id = ?', [id]);

  return { id, status: status ? 1 : 0 };
}

async function remove(id) {
  // comments.user_id 是 ON DELETE SET NULL，评论内容会保留
  const result = await db.query('DELETE FROM users WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new AppError(CODES.NOT_FOUND, '用户不存在');
  return { id };
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_MS,
  register,
  verifyLogin,
  createSession,
  findSessionUser,
  destroySession,
  hashToken,
  list,
  setStatus,
  remove,
};
