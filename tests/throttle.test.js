'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const throttle = require('../utils/throttle');

test('窗口内第二次命中返回剩余秒数，窗口外放行', async () => {
  const key = `t:${Date.now()}:${Math.random()}`;
  assert.equal(throttle.hit(key, 200), 0); // 首次放行

  const wait = throttle.hit(key, 200);
  assert.ok(wait >= 1, '窗口内应返回等待秒数');

  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(throttle.hit(key, 200), 0); // 过了窗口再次放行
});

test('不同 key 互不影响', () => {
  const a = `a:${Math.random()}`;
  const b = `b:${Math.random()}`;
  throttle.hit(a, 60000);
  assert.equal(throttle.hit(b, 60000), 0);
});
