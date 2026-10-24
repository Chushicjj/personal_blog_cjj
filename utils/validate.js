'use strict';

/**
 * 轻量参数校验（仅留言板在用）。
 * 校验失败统一抛 AppError(40001)，message 直接指出字段与原因，方便前端提示、也方便排查。
 */

const { AppError, CODES } = require('./response');

function text(value, field, options = {}) {
  const { required = true, min = 0, max = 1000 } = options;

  if (value === undefined || value === null) {
    if (required) throw new AppError(CODES.BAD_REQUEST, `缺少必填字段：${field}`);
    return '';
  }
  if (typeof value !== 'string') {
    throw new AppError(CODES.BAD_REQUEST, `字段 ${field} 必须是字符串`);
  }

  const v = value.trim();
  if (!v) {
    if (required) throw new AppError(CODES.BAD_REQUEST, `字段 ${field} 不能为空`);
    return '';
  }
  if (v.length < min) {
    throw new AppError(CODES.BAD_REQUEST, `字段 ${field} 至少 ${min} 个字符`);
  }
  if (v.length > max) {
    throw new AppError(CODES.BAD_REQUEST, `字段 ${field} 超长：最多 ${max} 个字符，当前 ${v.length}`);
  }
  return v;
}

/**
 * 分页参数：做宽松处理（非法值回退默认、超限截断），
 * 避免用户把 URL 里的 ?page=0 敲错就吃到 400 错误页。
 */
function pagination(query = {}, options = {}) {
  const { maxPageSize = 20 } = options;

  const rawPage = Number(query.page);
  const rawSize = Number(query.pageSize);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(maxPageSize, Math.floor(rawSize)) : 10;

  return { page, pageSize, offset: (page - 1) * pageSize };
}

module.exports = { text, pagination };
