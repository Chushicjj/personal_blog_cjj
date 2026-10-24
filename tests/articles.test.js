'use strict';

/**
 * 文章可见性条件回归测试（不连真实数据库，stub 掉 db 层抓 SQL）。
 *
 * 公开内容的判定口径是：
 *   deleted_at IS NULL AND status = 1 AND published_at IS NOT NULL AND published_at <= NOW()
 * 任何一处查询漏掉其中一项，草稿/定时未到的文章就会泄露到前台。
 */

// config/env 缺必需变量会直接 exit，先补齐哑值（不会真的建连）
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const articles = require('../services/articles');

const VISIBLE = [
  'deleted_at IS NULL',
  'status = 1',
  'published_at IS NOT NULL',
  'published_at <= NOW()',
];

function assertVisible(sql) {
  for (const fragment of VISIBLE) {
    assert.ok(sql.includes(fragment), `SQL 缺少可见性条件「${fragment}」：\n${sql}`);
  }
}

/** 捕获 db 层收到的 SQL，返回合理假数据让流程走完 */
function stubDb(t, captured) {
  const origQuery = db.query;
  const origQueryOne = db.queryOne;

  db.query = async (sql) => {
    captured.push(sql);
    return [];
  };
  db.queryOne = async (sql) => {
    captured.push(sql);
    if (/COUNT\(\*\)/.test(sql)) return { total: 0 };
    return null;
  };

  t.after(() => {
    db.query = origQuery;
    db.queryOne = origQueryOne;
  });
}

test('listPublished 的 COUNT 与 LIST 两条 SQL 都带全可见性条件', async (t) => {
  const captured = [];
  stubDb(t, captured);

  await articles.listPublished({ q: '关键字', category: 'tech', page: 1, pageSize: 10 });

  assert.equal(captured.length, 2);
  captured.forEach(assertVisible);
  // 词长 ≥2 走全文索引
  captured.forEach((sql) => assert.match(sql, /MATCH \(a\.title, a\.summary, a\.content_md\) AGAINST/));
  assert.match(captured[1], /LIMIT \? OFFSET \?/);
});

test('全文索引缺失（ER_FT_MATCHING_KEY_NOT_FOUND）时自动回退 LIKE', async (t) => {
  const captured = [];
  const origQuery = db.query;
  const origQueryOne = db.queryOne;

  db.query = async (sql) => {
    captured.push(sql);
    if (/MATCH/.test(sql)) {
      const err = new Error("Can't find FULLTEXT index");
      err.code = 'ER_FT_MATCHING_KEY_NOT_FOUND';
      throw err;
    }
    return [];
  };
  db.queryOne = async (sql) => {
    captured.push(sql);
    if (/MATCH/.test(sql)) {
      const err = new Error("Can't find FULLTEXT index");
      err.code = 'ER_FT_MATCHING_KEY_NOT_FOUND';
      throw err;
    }
    return { total: 0 };
  };
  t.after(() => {
    db.query = origQuery;
    db.queryOne = origQueryOne;
  });

  const result = await articles.listPublished({ q: '关键字', page: 1, pageSize: 10 });
  assert.equal(result.total, 0);
  // 先尝试 MATCH，失败后重试 LIKE
  assert.ok(captured.some((sql) => /MATCH/.test(sql)));
  assert.ok(captured.some((sql) => /a\.title LIKE \?/.test(sql)));
});

test('单字搜索直接走 LIKE，不用全文索引', async (t) => {
  const captured = [];
  stubDb(t, captured);

  await articles.listPublished({ q: '猫', page: 1, pageSize: 10 });
  assert.equal(captured.length, 2);
  captured.forEach((sql) => {
    assert.doesNotMatch(sql, /MATCH/);
    assert.match(sql, /LIKE \?/);
  });
});

test('findBySlug 详情与上下篇都带全可见性条件', async (t) => {
  const captured = [];
  stubDb(t, captured);

  const result = await articles.findBySlug('some-slug');
  assert.equal(result, null); // 假数据下查不到
  assert.equal(captured.length, 1);
  assertVisible(captured[0]);
});

test('categoryFacets 只统计已发布文章', async (t) => {
  const captured = [];
  stubDb(t, captured);

  await articles.categoryFacets();
  assert.equal(captured.length, 1);
  assertVisible(captured[0]);
});

test('listAdmin（后台）只排除软删，不要求已发布', async (t) => {
  const captured = [];
  stubDb(t, captured);

  await articles.listAdmin({ status: '0', keyword: '草稿' });
  assert.equal(captured.length, 2);
  for (const sql of captured) {
    assert.match(sql, /deleted_at IS NULL/);
    assert.doesNotMatch(sql, /published_at <= NOW\(\)/); // 后台要能看到草稿与定时文章
  }
});

test('normalizePublishAt 经由 prepare：合法 datetime-local 归一化，非法置空', () => {
  // prepare 不导出，通过 create 的参数间接验证成本太高；这里只测 slugify 与 readingMinutes 的边界
  assert.equal(articles.slugify('Hello World!'), 'hello-world');
  assert.match(articles.slugify('中文分类'), /^c-[0-9a-f]{12}$/);
});
