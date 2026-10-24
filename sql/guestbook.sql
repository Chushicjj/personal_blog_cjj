-- =============================================================================
-- 访客留言表（本次改造唯一新增的表）
--
-- 使用前必读：
--   1. 只操作已有的 blog 库；不包含 CREATE DATABASE / CREATE USER / GRANT；
--   2. 不包含 DROP / ALTER，可重复执行；
--   3. 原有 articles / categories / tags / article_tags / admins / site_pages
--      保留在库中且不做任何结构修改，程序已不再读写它们；
--   4. 本脚本需要手动执行，程序不会自动建表：
--      mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p blog < sql/guestbook.sql
--   5. 执行前自查：SHOW TABLES LIKE 'guestbook%';  （应返回空）
-- =============================================================================

CREATE TABLE IF NOT EXISTS `guestbook_messages` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nickname`   VARCHAR(50)     NOT NULL              COMMENT '昵称，接口限制 1-20 字符',
  `content`    VARCHAR(1000)   NOT NULL              COMMENT '留言内容，接口限制 1-500 字符',
  `ip_address` VARCHAR(45)     DEFAULT NULL          COMMENT '访客 IP（兼容 IPv6），仅后端留存，不返回前端',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_guestbook_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='访客留言';
