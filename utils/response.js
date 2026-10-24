'use strict';

/**
 * 统一响应格式：{ code, message, data }
 *  - code 为 0 表示成功，非 0 表示业务/系统错误；
 *  - 错误时 data 固定为 null，排查信息放在 message 里（足够具体），
 *    更细的堆栈只进日志，不回传给客户端。
 */

const CODES = {
  OK: 0,
  BAD_REQUEST: 40001,
  UNAUTHORIZED: 40100,
  LOGIN_FAILED: 40101,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  TOO_MANY_REQUESTS: 42900,
  INTERNAL: 50000,
  DB_UNAVAILABLE: 50300,
};

const HTTP_STATUS = {
  0: 200,
  40001: 400,
  40100: 401,
  40101: 401,
  40400: 404,
  40900: 409,
  42900: 429,
  50000: 500,
  50300: 503,
};

/**
 * 业务异常：路由里 throw，统一由 error-handler 中间件转成响应。
 */
class AppError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code] || 500;
    this.detail = detail || null;
  }
}

function ok(res, data, message) {
  res.json({ code: CODES.OK, message: message || 'ok', data: data === undefined ? null : data });
}

function fail(res, code, message, data) {
  res.status(HTTP_STATUS[code] || 500).json({
    code,
    message,
    data: data === undefined ? null : data,
  });
}

module.exports = { CODES, HTTP_STATUS, AppError, ok, fail };
