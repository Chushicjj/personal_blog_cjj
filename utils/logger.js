'use strict';

/**
 * 标准化日志：每行一个 JSON 对象。
 *
 * 设计取舍：
 *  - 单行 JSON 最利于 Docker / Loki / Filebeat 采集，不需要正则解析半结构化文本；
 *  - debug/info 走 stdout，warn/error 走 stderr，采集端天然能分开；
 *  - LOG_TO_FILE=true 时同时写 logs/app-<日期>.log，按天切换，便于宿主机挂载留存；
 *  - 日志本身出错绝不影响主流程（所有写入都兜底 catch）。
 */

const fs = require('fs');
const path = require('path');

const env = require('../config/env');

const LEVEL_WEIGHT = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVEL_WEIGHT[env.log.level] || LEVEL_WEIGHT.info;

// 按天分文件，同时只保留最近 N 天，避免长期运行后目录无限膨胀
const KEEP_DAYS = 14;
const FILE_RE = /^app-(\d{4})-(\d{2})-(\d{2})\.log$/;

let stream = null;
let streamDay = '';

function dayKey(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 切换日志文件时顺手清理过期文件；失败不影响写日志 */
function pruneOldFiles() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;

  fs.readdir(env.log.dir, (err, files) => {
    if (err || !files) return;

    files.forEach((name) => {
      const matched = FILE_RE.exec(name);
      if (!matched) return;

      const stamp = new Date(`${matched[1]}-${matched[2]}-${matched[3]}T00:00:00`).getTime();
      if (Number.isFinite(stamp) && stamp < cutoff) {
        fs.unlink(path.join(env.log.dir, name), () => {});
      }
    });
  });
}

function fileStream() {
  if (!env.log.toFile) return null;
  const day = dayKey();
  if (stream && day === streamDay) return stream;
  try {
    fs.mkdirSync(env.log.dir, { recursive: true });
    if (stream) stream.end();
    stream = fs.createWriteStream(path.join(env.log.dir, `app-${day}.log`), { flags: 'a' });
    stream.on('error', () => {
      stream = null;
    });
    streamDay = day;
    pruneOldFiles();
  } catch (err) {
    stream = null;
  }
  return stream;
}

function serialize(meta) {
  if (!meta || typeof meta !== 'object') return {};
  try {
    return JSON.parse(JSON.stringify(meta));
  } catch (err) {
    return { meta: '[unserializable]' };
  }
}

function write(level, message, meta) {
  if ((LEVEL_WEIGHT[level] || 0) < threshold) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    msg: String(message),
    ...serialize(meta),
  };

  let line;
  try {
    line = JSON.stringify(record) + '\n';
  } catch (err) {
    line = JSON.stringify({ ts: record.ts, level, msg: record.msg, meta: '[unserializable]' }) + '\n';
  }

  try {
    const target = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
    target.write(line);
  } catch (err) {
    /* 忽略：stdout 被关闭时不能让业务崩掉 */
  }

  const file = fileStream();
  if (file) {
    try {
      file.write(line);
    } catch (err) {
      /* 忽略 */
    }
  }
}

/** 把 Error 归一化成可序列化的字段，避免把整个对象塞进日志 */
function serializeError(err) {
  if (!err) return { err: 'unknown' };
  if (typeof err === 'string') return { err: 'Error', detail: err };
  return {
    err: err.code || err.name || 'Error',
    detail: err.message,
    stack: err.stack,
  };
}

const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  serializeError,
  close() {
    if (stream) {
      try {
        stream.end();
      } catch (err) {
        /* 忽略 */
      }
      stream = null;
    }
  },
};

module.exports = logger;
