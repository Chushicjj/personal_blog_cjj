'use strict';

/**
 * /api/admin/* 总入口。
 *
 * 顺序很关键：auth 里的登录接口必须挂在鉴权中间件之前，
 * 之后的每一个路由都默认要求已登录，新增子路由不需要再各自写一遍。
 */

const express = require('express');

const auth = require('./auth');
const articleRoutes = require('./articles');
const mediaRoutes = require('./media');
const videoRoutes = require('./videos');
const taxonomyRoutes = require('./taxonomy');
const messageRoutes = require('./messages');
const commentRoutes = require('./comments');
const userRoutes = require('./users');
const settingRoutes = require('./settings');
const pageRoutes = require('./pages');
const articles = require('../../services/articles');
const requireAdmin = require('../../middlewares/require-admin');
const { ok } = require('../../utils/response');

const router = express.Router();

router.use(auth);

router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  ok(res, await articles.stats());
});

router.use('/articles', articleRoutes);
router.use('/media', mediaRoutes);
router.use('/videos', videoRoutes);
router.use('/taxonomy', taxonomyRoutes);
router.use('/messages', messageRoutes);
router.use('/comments', commentRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingRoutes);
router.use('/pages', pageRoutes);

module.exports = router;
