'use strict';

/**
 * 密码哈希：scrypt$N$r$p$salt$hash
 *
 * 与 sql/schema.sql 里 admins.password_hash 的注释格式一致，
 * 库里已有的 scrypt$16384$8$1$... 记录可以直接校验通过。
 */

const crypto = require('crypto');

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;
// scrypt 的内存开销约 128 * N * r ≈ 16 MB，默认 maxmem 只有 32 MB，留足余量
const MAX_MEM = 64 * 1024 * 1024;

function hash(password) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const key = crypto.scryptSync(String(password), salt, KEY_LEN, { N, r: R, p: P, maxmem: MAX_MEM });
  return `scrypt$${N}$${R}$${P}$${salt}$${key.toString('hex')}`;
}

function verify(password, stored) {
  if (!stored || typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expected = Buffer.from(parts[5], 'hex');

  // 防止库被篡改成 N=2^30 这类参数把进程内存打爆
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  if (n < 1024 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  if (!salt || expected.length === 0) return false;

  let actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length, { N: n, r, p, maxmem: MAX_MEM });
  } catch (err) {
    return false;
  }

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

module.exports = { hash, verify };
