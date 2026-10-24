/**
 * 站点配置（纯静态文件，不含任何敏感信息）。
 *
 * 改站点信息只改这里 + 各页面里同名文案即可；页脚年份/建站时间/社交链接由 shell.js 注入。
 * github 留空字符串则自动隐藏 GitHub 入口。
 */
window.BLOG_CONFIG = {
  siteName: 'Blog_j',
  author: 'cjj',
  tagline: '写后端与运维，偶尔折腾静态站点。',
  since: '2024.03',
  github: 'https://github.com/cjj',
  email: 'chencjj2005@outlook.com',
  pageSize: 10
};
