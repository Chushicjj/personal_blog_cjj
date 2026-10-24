'use strict';

/**
 * GET /api/settings —— 前台读取站点信息（站点名 / 作者 / 简介 / 建站时间 / 社交链接）。
 *
 * 全部是公开展示用字段，不含任何后台信息。
 */

const express = require('express');

const settings = require('../services/settings');
const { ok } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  ok(res, await settings.getAll());
});

module.exports = router;
