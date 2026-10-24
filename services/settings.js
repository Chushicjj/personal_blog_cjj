'use strict';

/**
 * 站点设置：键值表 site_settings 的读写。
 *
 * 键固定为下面这几个，未入库的键回退到 DEFAULTS，
 * 所以首次部署不跑 SQL 也不会出现空白页面。
 */

const db = require('../db');

const DEFAULTS = {
  siteName: 'Blog_j',
  author: 'cjj',
  tagline: '写后端与运维，偶尔折腾静态站点。',
  since: '2024.03',
  github: 'https://github.com/cjj',
  email: 'chencjj2005@outlook.com',
  // 头像地址（/media/xxx.png 或外链）；留空时前台显示作者名首字母
  avatar: '',
};

const KEYS = Object.keys(DEFAULTS);

async function getAll() {
  const rows = await db.query('SELECT k, v FROM site_settings');
  const values = { ...DEFAULTS };

  rows.forEach((row) => {
    if (KEYS.includes(row.k)) values[row.k] = row.v;
  });

  return values;
}

async function save(values) {
  for (const key of KEYS) {
    if (values[key] === undefined) continue;

    await db.query(
      'INSERT INTO site_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
      [key, String(values[key])]
    );
  }

  return getAll();
}

module.exports = { DEFAULTS, KEYS, getAll, save };
