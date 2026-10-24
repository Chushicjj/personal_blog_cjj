'use strict';

/**
 * 404 兜底：
 *  - /api/* 与 /health 返回 JSON 错误，方便前端统一处理；
 *  - 其它路径返回静态 404 页面（Nginx 上线后由 Nginx 的 error_page 接管）。
 */

const path = require('path');

const env = require('../config/env');
const { CODES, HTTP_STATUS } = require('../utils/response');

module.exports = function notFound(req, res) {
  if (req.path === '/health' || req.path.startsWith('/api/') || req.path === '/api') {
    return res.status(HTTP_STATUS[CODES.NOT_FOUND]).json({
      code: CODES.NOT_FOUND,
      message: `接口不存在：${req.method} ${req.path}`,
      data: null,
    });
  }

  const page = path.join(env.root, 'public', '404.html');
  res.status(404).sendFile(page, (err) => {
    if (err && !res.headersSent) {
      res.type('text/plain; charset=utf-8').status(404).send('404 Not Found');
    }
  });
};
