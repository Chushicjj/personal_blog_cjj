'use strict';

/**
 * media 读缓存测试（stub db，不连真实数据库）：
 * 内容寻址的图片第二次读取必须命中缓存，不再查库；删除后缓存同步失效。
 */

process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../db');
const media = require('../services/media');

function stubDb(t, impl) {
  const origQuery = db.query;
  const origQueryOne = db.queryOne;
  db.query = impl.query;
  db.queryOne = impl.queryOne;
  t.after(() => {
    db.query = origQuery;
    db.queryOne = origQueryOne;
  });
}

const FAKE = {
  sha256: 'a'.repeat(64),
  ext: 'png',
  mime: 'image/png',
  size: 4,
  data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

test('同一图片第二次读取命中缓存，不重复查库', async (t) => {
  let dbHits = 0;
  stubDb(t, {
    query: async () => [],
    queryOne: async (sql) => {
      if (/FROM media/.test(sql)) {
        dbHits += 1;
        return { ...FAKE };
      }
      return null;
    },
  });

  const first = await media.read(FAKE.sha256, FAKE.ext);
  const second = await media.read(FAKE.sha256, FAKE.ext);
  assert.equal(first.mime, 'image/png');
  assert.equal(second.mime, 'image/png');
  assert.equal(dbHits, 1);
});

test('删除后缓存失效，再次读取回到数据库（得到 null）', async (t) => {
  let deleted = false;
  stubDb(t, {
    query: async (sql) => {
      if (/^DELETE FROM media/.test(sql)) deleted = true;
      return { affectedRows: 1 };
    },
    queryOne: async (sql) => {
      if (/^SELECT \* FROM media WHERE id/.test(sql)) {
        return deleted ? null : { id: 1, ...FAKE, original_name: 'a.png' };
      }
      if (/COUNT\(\*\) AS count FROM articles/.test(sql)) return { count: 0 };
      if (/FROM media/.test(sql)) return deleted ? null : { ...FAKE };
      return null;
    },
  });

  // 先读一次进缓存
  await media.read(FAKE.sha256, FAKE.ext);
  // 删除（未被引用，force 不需要）
  const result = await media.remove(1);
  assert.equal(result.used, 0);
  // 缓存已失效，再读拿到 null
  assert.equal(await media.read(FAKE.sha256, FAKE.ext), null);
});
