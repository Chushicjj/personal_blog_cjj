'use strict';

/**
 * 极简 Cookie 读写：不引入 cookie-parser，项目只需要「取一个值 + 写一个值」。
 */

function parse(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;

  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 1) return;

    const name = pair.slice(0, idx).trim();
    if (!name) return;

    let value = pair.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch (err) {
      /* 保留原值 */
    }
    out[name] = value;
  });

  return out;
}

function serialize(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) parts.push('Secure');

  return parts.join('; ');
}

module.exports = { parse, serialize };
