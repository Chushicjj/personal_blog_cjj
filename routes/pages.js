'use strict';

/**
 * GET /api/pages/:key —— 前台读取单页内容。
 * about 页由静态壳 + 这个接口填充；自定义页面由 /p/:key 直出。
 */

const express = require('express');

const pages = require('../services/pages');
const { ok, AppError, CODES } = require('../utils/response');

const router = express.Router();

router.get('/:key', async (req, res) => {
  const key = String(req.params.key || '').toLowerCase();

  if (!pages.isValidKey(key)) {
    throw new AppError(CODES.NOT_FOUND, '页面不存在');
  }

  const page = await pages.getPublic(key);
  if (!page) throw new AppError(CODES.NOT_FOUND, '页面还没有内容');

  res.setHeader('Cache-Control', 'no-cache');
  ok(res, page);
});

module.exports = router;
