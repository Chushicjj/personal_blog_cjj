'use strict';

/**
 * GET /p/:key —— 自定义页面直出。关于页不走这里（它是 /about.html）。
 */

const express = require('express');

const pages = require('../services/pages');
const settings = require('../services/settings');
const { renderPage } = require('../views/page');

const router = express.Router();

router.get('/:key', async (req, res, next) => {
  const key = String(req.params.key || '').toLowerCase();

  if (!pages.isValidKey(key)) return next();

  const page = await pages.getPublic(key);
  if (!page) return next();

  const site = await settings.getAll().catch(() => null);

  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(renderPage(page, { siteName: site && site.siteName }));
});

module.exports = router;
