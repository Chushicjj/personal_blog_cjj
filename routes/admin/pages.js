'use strict';

/**
 * 后台单页管理：
 *   GET    /api/admin/pages        列表
 *   GET    /api/admin/pages/:key   单页（含 Markdown）
 *   PUT    /api/admin/pages/:key   新建 / 覆盖
 *   DELETE /api/admin/pages/:key   删除
 */

const express = require('express');

const pages = require('../../services/pages');
const logger = require('../../utils/logger');
const { ok, AppError, CODES } = require('../../utils/response');
const { text } = require('../../utils/validate');

const router = express.Router();

function parseKey(value) {
  const key = String(value || '').toLowerCase();
  if (!pages.isValidKey(key)) {
    throw new AppError(CODES.BAD_REQUEST, '页面标识只能是小写字母开头，包含小写字母、数字和短横线，最长 50');
  }
  return key;
}

router.get('/', async (req, res) => {
  ok(res, { list: await pages.list(), reserved: pages.RESERVED });
});

router.get('/:key', async (req, res) => {
  const page = await pages.get(parseKey(req.params.key));
  ok(res, page || { key: parseKey(req.params.key), title: '', contentMd: '', contentHtml: '', updatedAt: null });
});

router.put('/:key', async (req, res) => {
  const key = parseKey(req.params.key);
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  const title = text(body.title, 'title', { max: 100 });
  const contentMd = text(body.contentMd, 'contentMd', { max: 200000 });

  const saved = await pages.save(key, { title, contentMd });

  logger.info('page_saved', { reqId: req.id, key, adminId: req.admin.id });
  ok(res, { key: saved.key, title: saved.title, updatedAt: saved.updatedAt }, '已保存');
});

router.delete('/:key', async (req, res) => {
  const key = parseKey(req.params.key);

  // about 是站点导航里写死的入口，删了前台就空一块，不允许删
  if (key === 'about') {
    throw new AppError(CODES.BAD_REQUEST, '关于页不能删除，可以把内容改空或直接编辑');
  }

  const removed = await pages.remove(key);
  if (!removed) throw new AppError(CODES.NOT_FOUND, '页面不存在');

  logger.info('page_deleted', { reqId: req.id, key, adminId: req.admin.id });
  ok(res, { key }, '已删除');
});

module.exports = router;
