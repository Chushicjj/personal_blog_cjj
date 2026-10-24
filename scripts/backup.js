'use strict';

/**
 * 备份：数据库全量 dump + 上传的视频目录打包。
 *
 *   node scripts/backup.js
 *
 * 为什么不用纯 Node 导 JSON：图片是 LONGBLOB，转 base64 后体积涨 33%，
 * 而且恢复时要写回库，反而不如 mysqldump 的一行 SQL 直接。
 *
 * 依赖外部的 mysqldump / tar：服务器上通常都有；缺了会给出替代命令。
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const env = require('../config/env');

const BACKUP_DIR = path.resolve(env.root, process.env.BACKUP_DIR || 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 7);
const UPLOADS = path.join(env.upload.dir);

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args);
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `${cmd} 退出码 ${code}`))));
  });
}

function dumpDatabase(target) {
  return new Promise((resolve, reject) => {
    const args = [
      `-h${env.db.host}`,
      `-P${env.db.port}`,
      `-u${env.db.user}`,
      '--single-transaction',
      '--quick',
      '--default-character-set=utf8mb4',
      '--databases',
      env.db.database,
    ];

    const child = spawn('mysqldump', args, { env: { ...process.env, MYSQL_PWD: env.db.password } });
    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(target);

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      out.destroy();
      reject(err);
    });

    child.stdout.pipe(gzip).pipe(out);

    out.on('finish', () => resolve());
    out.on('error', reject);

    child.on('close', (code) => {
      if (code !== 0) {
        out.destroy();
        reject(new Error(stderr || `mysqldump 退出码 ${code}`));
      }
    });
  });
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const tag = stamp();
  const dbFile = path.join(BACKUP_DIR, `db-${tag}.sql.gz`);
  const uploadFile = path.join(BACKUP_DIR, `uploads-${tag}.tar.gz`);

  process.stdout.write(`备份数据库 → ${dbFile}\n`);
  try {
    await dumpDatabase(dbFile);
  } catch (err) {
    // 失败时别留一个 0 字节的 .gz 假装备份成功
    try {
      fs.unlinkSync(dbFile);
    } catch (cleanupErr) {
      /* 文件可能根本没创建 */
    }

    if (err.code === 'ENOENT') {
      console.error('\n找不到 mysqldump。三条路：');
      console.error('  1) 装 MySQL 客户端：apt install mysql-client / yum install mysql');
      console.error('  2) 用容器里的：docker exec <mysql容器> mysqldump -u用户 -p密码 blog > blog.sql');
      console.error('  3) 只备份上传文件：跳过数据库这一步（视频丢了还好，文章丢了才是灾难）');
      process.exit(1);
    }
    throw err;
  }

  const dbSize = fs.statSync(dbFile).size;
  process.stdout.write(`  完成，${(dbSize / 1024 / 1024).toFixed(2)} MB\n`);

  if (fs.existsSync(UPLOADS)) {
    process.stdout.write(`打包上传目录 → ${uploadFile}\n`);
    try {
      // -C 到上级目录，包里保留 video/... 相对结构
      await run('tar', ['-czf', uploadFile, '-C', path.dirname(UPLOADS), path.basename(UPLOADS)]);
      process.stdout.write(`  完成，${(fs.statSync(uploadFile).size / 1024 / 1024).toFixed(2)} MB\n`);
    } catch (err) {
      process.stdout.write(`  跳过：${err.message}\n`);
    }
  }

  // 清理过期备份
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  fs.readdirSync(BACKUP_DIR).forEach((name) => {
    if (!/^(db|uploads)-\d{8}-\d{4}\.(sql|tar)\.gz$/.test(name)) return;
    const full = path.join(BACKUP_DIR, name);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      removed += 1;
    }
  });

  process.stdout.write(`\n完成。保留最近 ${KEEP_DAYS} 天，本次清理 ${removed} 个旧文件。\n`);
  process.stdout.write('恢复示例：gunzip -c db-xxx.sql.gz | mysql -u用户 -p blog\n');
}

main().catch((err) => {
  console.error('备份失败：', err.message);
  process.exit(1);
});
