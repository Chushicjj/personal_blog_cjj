'use strict';

/**
 * 访客留言接口（全站唯一的写接口）：
 *   GET  /api/messages   分页查询留言
 *   POST /api/messages   提交留言
 *
 * 说明：
 *  - 留言不做审核，提交成功即可见；
 *  - ip_address 只落库用于溯源，永远不返回给前端；
 *  - 昵称与内容只做长度/非空校验，原样入库，展示端统一转义，避免 XSS。
 */

const express = require('express');

const db = require('../db');
const logger = require('../utils/logger');
const throttle = require('../utils/throttle');
const { ok, AppError, CODES } = require('../utils/response');
const { text, pagination } = require('../utils/validate');

const router = express.Router();

const NICKNAME_MAX = 20;
const CONTENT_MAX = 500;
const PAGE_SIZE_MAX = 20;
// 同一 IP 两次留言的最小间隔（与文章评论保持一致）
const INTERVAL_MS = 15 * 1000;

function toMessage(row) {
  return {
    id: row.id,
    nickname: row.nickname,
    content: row.content,
    createdAt: row.created_at,
  };
}

/** 表没建时给出可执行的提示，而不是一句干巴巴的 500 */
function rethrowTableMissing(err) {
  if (err && err.code === 'ER_NO_SUCH_TABLE') {
    throw new AppError(
      CODES.INTERNAL,
      '留言功能未初始化：数据库缺少 guestbook_messages 表，请执行 sql/guestbook.sql'
    );
  }
  throw err;
}

router.get('/', async (req, res) => {
  const { page, pageSize, offset } = pagination(req.query, { maxPageSize: PAGE_SIZE_MAX });

  let totalRow;
  let rows;
  try {
    totalRow = await db.queryOne('SELECT COUNT(*) AS total FROM guestbook_messages');
    rows = await db.query(
      `SELECT id, nickname, content, created_at
         FROM guestbook_messages
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [pageSize, offset]
    );
  } catch (err) {
    rethrowTableMissing(err);
  }

  const total = Number(totalRow ? totalRow.total : 0);

  ok(res, {
    list: rows.map(toMessage),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  });
});

router.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const nickname = text(body.nickname, 'nickname', { max: NICKNAME_MAX });
  const content = text(body.content, 'content', { max: CONTENT_MAX });

  // 去掉 IPv4-mapped 前缀，兼容 IPv6（列宽 45）
  const ip = (req.ip || '').replace(/^::ffff:/, '').slice(0, 45) || null;

  // 留言板是匿名入口，必须限流，否则一条脚本就能刷满整页
  const wait = throttle.hit(`message:${ip || 'unknown'}`, INTERVAL_MS);
  if (wait) {
    throw new AppError(CODES.TOO_MANY_REQUESTS, `发得太快了，${wait} 秒后再试`);
  }

  let result;
  let row;
  try {
    result = await db.query('INSERT INTO guestbook_messages (nickname, content, ip_address) VALUES (?, ?, ?)', [
      nickname,
      content,
      ip,
    ]);
    row = await db.queryOne(
      'SELECT id, nickname, content, created_at FROM guestbook_messages WHERE id = ?',
      [result.insertId]
    );
  } catch (err) {
    rethrowTableMissing(err);
  }

  logger.info('message_created', { reqId: req.id, id: result.insertId, ip });

  ok(res, toMessage(row), '留言已发布');
});

module.exports = router;
