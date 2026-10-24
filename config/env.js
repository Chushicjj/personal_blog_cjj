'use strict';

/**
 * 统一的环境变量入口。
 *
 * 约定：
 *  1. 所有配置只从 process.env 读取，代码里不出现任何账号 / 密码 / 密钥字面量；
 *  2. 缺少必需项时立即失败并打印缺的是哪一个，避免"启动成功但功能全坏"的隐性故障；
 *  3. 其它模块只 require 本文件，不再直接读 process.env，方便统一排查。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');

// .env 只在文件存在时加载；容器内由 docker-compose 注入环境变量
if (fs.existsSync(ENV_FILE)) {
  require('dotenv').config({ path: ENV_FILE, quiet: true });
}

function raw(name) {
  const value = process.env[name];
  return value === undefined || value === null ? '' : String(value).trim();
}

function pick(name, fallback) {
  const value = raw(name);
  return value === '' ? fallback : value;
}

function number(name, fallback) {
  const value = raw(name);
  if (value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name, fallback) {
  const value = raw(name).toLowerCase();
  if (value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

const missing = [];

function required(name, hint) {
  const value = raw(name);
  if (value === '') {
    missing.push(hint ? `${name}（${hint}）` : name);
    return '';
  }
  return value;
}

const nodeEnv = pick('NODE_ENV', 'development');

const dbHost = required('DB_HOST', '数据库地址');
const dbPort = number('DB_PORT', 3306);
const dbUser = required('DB_USER', '数据库用户名');
const dbPassword = required('DB_PASSWORD', '数据库密码');
const dbName = required('DB_NAME', '数据库名');

const logDirRaw = pick('LOG_DIR', 'logs');
const logDir = path.isAbsolute(logDirRaw) ? logDirRaw : path.join(ROOT, logDirRaw);

// 上传目录：图片存库，视频这类大文件落磁盘，容器里挂 volume 持久化
const uploadDirRaw = pick('UPLOAD_DIR', 'data/uploads');
const uploadDir = path.isAbsolute(uploadDirRaw) ? uploadDirRaw : path.join(ROOT, uploadDirRaw);

// 数据库会话时区：只接受数字偏移或 UTC，避免依赖服务器是否导入时区表
const dbTimezone = pick('DB_TIMEZONE', '+08:00');
if (dbTimezone !== 'UTC' && !/^[+-]\d{2}:\d{2}$/.test(dbTimezone)) {
  missing.push('DB_TIMEZONE（格式应为 +08:00 或 UTC）');
}

if (missing.length) {
  const lines = [
    '',
    '[config] 启动中止：缺少必需的环境变量',
    ...missing.map((item) => `         - ${item}`),
    '',
    `  请追加到 ${ENV_FILE}（参考 .env.example），或在容器环境变量中注入。`,
    '',
  ];
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(1);
}

const env = {
  root: ROOT,
  nodeEnv,
  isProduction: nodeEnv === 'production',
  server: {
    port: number('SERVER_PORT', number('PORT', 3000)),
  },
  db: {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
    poolSize: number('DB_POOL_SIZE', 10),
    connectTimeout: number('DB_CONNECT_TIMEOUT', 10000),
    timezone: dbTimezone,
  },
  log: {
    level: pick('LOG_LEVEL', 'info').toLowerCase(),
    toFile: bool('LOG_TO_FILE', false),
    dir: logDir,
  },
  upload: {
    dir: uploadDir,
    // 本地上传的视频体积上限（MB）；超限直接 400，不写盘
    videoMaxMb: number('VIDEO_MAX_MB', 100),
  },
  // 供 /health 与日志识别版本，不读 package.json 以避免运行期多一次 IO
  appName: 'blog-api',
  appVersion: pick('APP_VERSION', '1.0.0'),
};

module.exports = env;
