'use strict';

/**
 * 把 seed/pages/*.md 导入 site_pages（幂等：已存在的 key 默认跳过）。
 *
 *   node scripts/seed-pages.js           # 补齐缺失页面
 *   node scripts/seed-pages.js --force   # 覆盖已有页面
 *
 * front-matter 只需 key 与 title，正文是普通 Markdown。
 */

const fs = require('fs');
const path = require('path');

const db = require('../db');
const pages = require('../services/pages');
const env = require('../config/env');

const DIR = path.join(env.root, 'seed', 'pages');
const force = process.argv.includes('--force');

function parseFrontMatter(raw) {
  const matched = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!matched) return { meta: {}, body: raw };

  const meta = {};
  matched[1].split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx < 1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  });

  return { meta, body: matched[2] };
}

async function main() {
  if (!fs.existsSync(DIR)) {
    console.log(`目录不存在：${DIR}`);
    return;
  }

  const files = fs.readdirSync(DIR).filter((name) => name.endsWith('.md')).sort();
  if (!files.length) {
    console.log('seed/pages 下没有 .md 文件');
    return;
  }

  for (const name of files) {
    const raw = fs.readFileSync(path.join(DIR, name), 'utf8');
    const { meta, body } = parseFrontMatter(raw);
    const key = String(meta.key || name.replace(/\.md$/, '')).toLowerCase();
    const title = (meta.title || key).trim();

    if (!pages.isValidKey(key)) {
      console.log(`  跳过 ${name}：key 不合法`);
      continue;
    }
    if (!body.trim()) {
      console.log(`  跳过 ${key}：内容为空`);
      continue;
    }

    const existing = await pages.get(key);
    if (existing && !force) {
      console.log(`  跳过 ${key}：已存在（加 --force 覆盖）`);
      continue;
    }

    await pages.save(key, { title, contentMd: body });
    console.log(`  ${existing ? '更新' : '新增'} ${key}`);
  }

  const rows = await pages.list();
  console.log(`\n当前单页：${rows.map((item) => item.key).join(', ') || '（空）'}`);
}

main()
  .then(() => db.close())
  .catch(async (err) => {
    console.error('导入失败：', err.code || '', err.message);
    await db.close().catch(() => {});
    process.exit(1);
  });
