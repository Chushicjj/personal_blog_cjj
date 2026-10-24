'use strict';

/**
 * 可选鉴权：有访客会话就挂到 req.user，没有就是 null。
 *
 * 与 require-admin 的区别是「绝不拦截」——文章页、评论列表对未登录访客同样开放，
 * 只是评论区会显示成「登录后才能评论」。
 */

const cookies = require('../utils/cookies');
const users = require('../services/users');
const logger = require('../utils/logger');

module.exports = async function attachUser(req, res, next) {
  req.user = null;

  try {
    const token = cookies.parse(req.headers.cookie)[users.COOKIE_NAME];
    if (!token) return next();

    const found = await users.findSessionUser(token);
    if (found) {
      req.user = found.user;
      req.userSessionId = found.sessionId;
    }
  } catch (err) {
    // 会话表查不了也不能让页面 500，按未登录处理
    logger.warn('attach_user_failed', logger.serializeError(err));
  }

  next();
};
