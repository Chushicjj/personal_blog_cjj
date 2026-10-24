'use strict';

/**
 * 路由总装配表。
 *
 *   /health                运维探活
 *   /api/messages          访客留言（公开）
 *   /api/articles          文章列表与详情（公开）
 *   /api/admin/*           后台管理（登录后可用）
 *   /media/:file           图片，从数据库读
 *   /posts/:slug           文章页，服务端直出
 *
 * 展示类页面（首页、列表、关于、留言板）仍是 public/ 下的静态文件。
 */

const express = require('express');

const health = require('./health');
const auth = require('./auth');
const messages = require('./messages');
const articleApi = require('./articles');
const settingsApi = require('./settings');
const pageApi = require('./pages');
const archiveApi = require('./archive');
const seo = require('./seo');
const adminApi = require('./admin');
const mediaRoute = require('./media');
const posts = require('./posts');
const pageRoute = require('./page');
const attachUser = require('../middlewares/attach-user');

const router = express.Router();

router.get('/health', health);

// 访客会话（可选鉴权）：挂在静态资源之前，/assets 之类不会走到这里
router.use(attachUser);

router.use('/api/auth', auth);
router.use('/api/messages', messages);
router.use('/api/articles', articleApi);
router.use('/api/settings', settingsApi);
router.use('/api/pages', pageApi);
router.use('/api/archive', archiveApi);
// sitemap.xml / feed.xml 挂在根路径
router.use(seo);
router.use('/api/admin', adminApi);
router.use('/media', mediaRoute);
router.use('/posts', posts);
router.use('/p', pageRoute);

module.exports = router;
