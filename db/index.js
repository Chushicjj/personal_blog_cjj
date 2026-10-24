'use strict';

/**
 * 数据库访问层：连接池只在这里创建，业务代码统一走 query / queryOne / withTransaction。
 *
 * 关键点：
 *  - 连接池全局单例复用，避免每个请求新建连接；
 *  - dateStrings: true —— DATETIME 直接返回 'YYYY-MM-DD HH:mm:ss' 字符串，
 *    绕开 Node 与 MySQL 的时区换算，前端也不需要解析 Date；
 *  - 所有 SQL 都走占位符，杜绝字符串拼接注入；
 *  - 查询失败统一记 error 日志（含 SQL 前 300 字符），便于定位。
 */

const mysql = require('mysql2/promise');

const env = require('../config/env');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.poolSize,
  maxIdle: env.db.poolSize,
  idleTimeout: 60000,
  queueLimit: 0,
  connectTimeout: env.db.connectTimeout,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

function brief(sql) {
  return String(sql).replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * 每条新连接建立后统一会话时区。
 *
 * 为什么必须做：DATETIME 列存的是"墙上时间"，NOW() / CURRENT_TIMESTAMP 走的是会话时区。
 * 如果应用写本地时间、数据库默认值走服务器时区（常见是 UTC），同一条记录会出现
 * published_at 与 updated_at 相差 8 小时的情况。统一会话时区后所有时间口径一致。
 */
pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [env.db.timezone], (err) => {
    if (err) {
      logger.warn('db_timezone_set_failed', {
        timezone: env.db.timezone,
        ...logger.serializeError(err),
      });
      return;
    }
    logger.debug('db_session_timezone_set', { timezone: env.db.timezone });
  });
});

async function query(sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (err) {
    logger.error('db_query_failed', {
      ...logger.serializeError(err),
      sql: brief(sql),
      paramCount: params.length,
    });
    throw err;
  }
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/**
 * 事务封装：handler 收到一个只有 query 的轻量连接对象。
 * 抛错自动回滚，成功自动提交，连接一定归还。
 */
async function withTransaction(handler) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await handler({
      query: async (sql, params = []) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      },
    });
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      logger.error('db_rollback_failed', logger.serializeError(rollbackErr));
    }
    throw err;
  } finally {
    connection.release();
  }
}

/** 健康检查用的轻量探测，带超时，避免 DB 假死时 /health 跟着挂住 */
async function ping(timeoutMs = 1500) {
  let timer;
  try {
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`数据库探测超时（>${timeoutMs}ms）`)), timeoutMs);
    });
    const started = process.hrtime.bigint();
    await Promise.race([pool.query('SELECT 1'), timeout]);
    return Math.round(Number(process.hrtime.bigint() - started) / 1e6);
  } finally {
    clearTimeout(timer);
  }
}

function isDuplicate(err) {
  return Boolean(err) && err.code === 'ER_DUP_ENTRY';
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, queryOne, withTransaction, ping, isDuplicate, close };
