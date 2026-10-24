'use strict';

/**
 * 后台站点设置：
 *   GET /api/admin/settings
 *   PUT /api/admin/settings  { siteName, author, tagline, since, github, email }
 *
 * 保存后前台下一次请求 /api/settings 即生效，不用重启服务、不用改代码。
 */

const express = require('express');

const settings = require('../../services/settings');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');
const { text } = require('../../utils/validate');

const router = express.Router();

const LIMITS = {
  siteName: 40,
  author: 40,
  tagline: 120,
  since: 20,
  github: 200,
  email: 120,
  avatar: 255,
};

router.get('/', async (req, res) => {
  ok(res, await settings.getAll());
});

router.put('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const siteName = text(body.siteName, 'siteName', { max: LIMITS.siteName });
  const author = text(body.author, 'author', { max: LIMITS.author });
  const tagline = text(body.tagline, 'tagline', { required: false, max: LIMITS.tagline });
  const since = text(body.since, 'since', { required: false, max: LIMITS.since });
  const github = text(body.github, 'github', { required: false, max: LIMITS.github });
  const email = text(body.email, 'email', { required: false, max: LIMITS.email });
  const avatar = text(body.avatar, 'avatar', { required: false, max: LIMITS.avatar });

  if (github && !/^https?:\/\/\S+$/i.test(github)) {
    throw new AppError(CODES.BAD_REQUEST, 'GitHub 地址需要以 http:// 或 https:// 开头');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(CODES.BAD_REQUEST, '邮箱格式不正确');
  }
  // 头像只接受站内媒体库地址或外链，避免被写进 javascript: 之类的伪协议
  if (avatar && !/^\/media\/[\w.-]+$/.test(avatar) && !/^https?:\/\/\S+$/i.test(avatar)) {
    throw new AppError(CODES.BAD_REQUEST, '头像地址需要是 /media/ 下的图片或 http(s) 外链');
  }

  const saved = await settings.save({ siteName, author, tagline, since, github, email, avatar });

  logger.info('settings_updated', { reqId: req.id, adminId: req.admin.id });
  ok(res, saved, '设置已保存');
});

module.exports = router;
