'use strict';

/**
 * GET /media/:sha256.:ext —— 从数据库读出图片并返回。
 *
 * URL 是内容寻址的（哈希即文件名），所以可以发 immutable 一年缓存：
 * 内容一变哈希就变，URL 跟着变，不存在「缓存了旧图」的问题。
 */

const express = require('express');

const media = require('../services/media');

const router = express.Router();

const FILE_RE = /^([a-f0-9]{64})\.([a-z0-9]{2,5})$/;

router.get('/:file', async (req, res, next) => {
  const matched = FILE_RE.exec(String(req.params.file || ''));
  if (!matched) return next();

  const [, sha256, ext] = matched;
  const etag = `"${sha256}"`;

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const row = await media.read(sha256, ext);
  if (!row) return next();

  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Length', row.data.length);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(row.data);
});

module.exports = router;
