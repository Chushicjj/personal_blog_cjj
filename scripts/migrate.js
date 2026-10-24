'use strict';

/**
 * 执行 sql/ 下的建表脚本（不依赖本机装 mysql 客户端）。
 *
 *   node scripts/migrate.js              # 依次执行 admin.sql、guestbook.sql
 *   node scripts/migrate.js admin        # 只执行 sql/admin.sql
 *
 * 脚本内所有语句都是幂等的，重复执行安全。
 */

const fs = require('fs');
const path = require('path');

const mysql = require('mysql2/promise');

const env = require('../config/env');

// schema 必须在最前：comments/users 的外键依赖 articles，admin 还要 ALTER articles
const FILES = ['schema', 'guestbook', 'comments', 'users', 'admin', 'cleanup', 'fulltext'];

async function main() {
  const only = process.argv[2];
  const targets = only ? [only] : FILES;

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    charset: 'utf8mb4',
    multipleStatements: true,
    connectTimeout: env.db.connectTimeout,
  });

  try {
    for (const name of targets) {
      const file = path.join(env.root, 'sql', `${name}.sql`);
      if (!fs.existsSync(file)) {
        console.log(`跳过 ${name}.sql：文件不存在`);
        continue;
      }
      const sql = fs.readFileSync(file, 'utf8');
      await connection.query(sql);
      console.log(`已执行 sql/${name}.sql`);
    }

    const [tables] = await connection.query('SHOW TABLES');
    const names = tables.map((row) => Object.values(row)[0]);
    console.log(`\n当前库 ${env.db.database} 的表：${names.join(', ')}`);
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('迁移失败：', err.code || '', err.message);
  process.exit(1);
});
