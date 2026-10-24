'use strict';

/**
 * 生成 / 重置「后台管理账号」的密码（不是 MySQL 的密码）。
 *
 *   node scripts/hash-password.js <用户名> <新密码>          # 只打印 SQL
 *   node scripts/hash-password.js <用户名> <新密码> --apply  # 直接写入当前 .env 指向的库
 *
 * 默认只输出 SQL 不碰数据库，方便你先看一眼再执行；
 * 本机没装 mysql 客户端时加 --apply，脚本用项目自己的连接池写库。
 */

const password = require('../utils/password');

const args = process.argv.slice(2).filter((item) => item !== '--apply');
const apply = process.argv.includes('--apply');

const username = args[0];
const plain = args[1];

if (!username || !plain) {
  console.error('用法：node scripts/hash-password.js <用户名> <新密码> [--apply]');
  process.exit(1);
}

if (plain.length < 8) {
  console.error('密码至少 8 位');
  process.exit(1);
}

const hash = password.hash(plain);
const safeUser = username.replace(/'/g, "''");

function printSql() {
  console.log('');
  console.log('密码哈希：');
  console.log(hash);
  console.log('');
  console.log('写入数据库（已有账号则改密码，没有则新建）：');
  console.log(
    `INSERT INTO admins (username, password_hash) VALUES ('${safeUser}', '${hash}')\n` +
      `  ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash);`
  );
  console.log('');
  console.log('改完密码后建议让旧会话失效：');
  console.log(`DELETE s FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE a.username = '${safeUser}';`);
  console.log('');
}

async function applyToDatabase() {
  const db = require('../db');

  try {
    const result = await db.query(
      'INSERT INTO admins (username, password_hash) VALUES (?, ?) ' +
        'ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
      [username, hash]
    );

    const admin = await db.queryOne('SELECT id, username FROM admins WHERE username = ? LIMIT 1', [username]);
    // 改密码即踢掉所有旧会话，避免旧 Cookie 继续可用
    const revoked = await db.query('DELETE FROM admin_sessions WHERE admin_id = ?', [admin.id]);

    console.log(`已写入数据库：账号 ${admin.username}（id=${admin.id}）`);
    console.log(`密码已更新；旧会话已失效 ${revoked.affectedRows} 个。`);
    console.log(`影响行数：${result.affectedRows}（2 表示更新了已有账号）`);
  } finally {
    await db.close();
  }
}

if (apply) {
  console.log('自检：', password.verify(plain, hash) ? '通过' : '失败');
  applyToDatabase().catch((err) => {
    console.error('写入失败：', err.code || '', err.message);
    process.exit(1);
  });
} else {
  printSql();
  // 顺手自检一次，避免 hash 格式被改坏
  console.log('自检：', password.verify(plain, hash) ? '通过' : '失败');
  console.log('想直接写库就加 --apply 再跑一次。');
}
