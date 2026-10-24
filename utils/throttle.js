'use strict';

/**
 * 极简内存限流：同一个 key（一般用 IP）在时间窗内只允许通过一次。
 *
 * 用途：评论/留言这类无需登录的写接口，防止脚本刷屏。
 * 局限：进程重启即清空，多实例部署时各算各的——对个人站点够用，
 *      真要抗攻击还是得上 Nginx limit_req 或验证码。
 */

const buckets = new Map();
const MAX_ENTRIES = 5000;

/**
 * @returns {number} 0 表示放行；否则返回还需等待的秒数
 */
function hit(key, windowMs) {
  const now = Date.now();
  const last = buckets.get(key) || 0;
  const elapsed = now - last;

  if (last && elapsed < windowMs) {
    return Math.max(1, Math.ceil((windowMs - elapsed) / 1000));
  }

  buckets.set(key, now);

  // 长期运行下 Map 会缓慢增长，超过阈值就清理过期项
  if (buckets.size > MAX_ENTRIES) {
    for (const [item, stamp] of buckets) {
      if (now - stamp > windowMs * 4) buckets.delete(item);
    }
  }

  return 0;
}

module.exports = { hit };
