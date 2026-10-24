'use strict';

/**
 * 全局错误处理：把任何异常收敛成 { code, message, data: null }。
 *  - AppError（业务异常）按自带 code / message 返回；
 *  - 请求体 JSON 非法、体积超限等框架错误映射成 40001；
 *  - 其它一律 50000，message 里带 requestId，方便用户报编号、我们查日志。
 */

const { AppError, CODES, HTTP_STATUS } = require('../utils/response');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let code = CODES.INTERNAL;
  let status = HTTP_STATUS[CODES.INTERNAL];
  let message = `服务器内部错误（requestId: ${req.id || '-'}）`;

  if (err instanceof AppError) {
    code = err.code;
    status = err.status;
    message = err.message;
  } else if (err && err.type === 'entity.parse.failed') {
    code = CODES.BAD_REQUEST;
    status = HTTP_STATUS[CODES.BAD_REQUEST];
    message = '请求体不是合法的 JSON';
  } else if (err && err.type === 'entity.too.large') {
    code = CODES.BAD_REQUEST;
    status = 413;
    message = '请求体过大，单次请求上限 1MB';
  } else if (err && err.code === 'ER_DUP_ENTRY') {
    code = CODES.CONFLICT;
    status = HTTP_STATUS[CODES.CONFLICT];
    message = '数据重复：slug 或名称已存在';
  }

  const level = status >= 500 ? 'error' : 'warn';
  const meta = {
    reqId: req.id,
    code,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    err: (err && (err.code || err.name)) || 'Error',
    detail: err && err.message,
  };
  if (err && err.detail) meta.reason = err.detail;
  // 堆栈只对 5xx 记录：4xx 是用户输入问题，记堆栈只会淹没日志
  if (status >= 500 && err && err.stack) meta.stack = err.stack;

  logger[level]('request_error', meta);

  res.status(status).json({ code, message, data: null });
};
