-- =============================================================================
-- 后台管理所需的表结构（可重复执行）
--
-- 执行：
--   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p blog < sql/admin.sql
--
-- 内容：
--   1. media          图片（二进制存库，sha256 去重）
--   2. admin_sessions 后台登录会话（只存 token 的哈希）
--   3. articles 补三列 cover_image / is_top / deleted_at
--   4. site_settings  站点设置键值表（含默认值）
--
-- 说明：只用 CREATE TABLE IF NOT EXISTS 与「先查 information_schema 再 ALTER」，
--       重复执行不会报错，也不会丢数据。
-- =============================================================================

-- ---------------------------- 图片 ----------------------------
CREATE TABLE IF NOT EXISTS `media` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sha256`        CHAR(64)        NOT NULL                COMMENT '内容指纹，用于同一张图只存一份',
  `mime`          VARCHAR(60)     NOT NULL                COMMENT 'image/png 等',
  `ext`           VARCHAR(10)     NOT NULL                COMMENT '文件扩展名，用于生成 URL',
  `size`          INT UNSIGNED    NOT NULL                COMMENT '字节数',
  `original_name` VARCHAR(200)    DEFAULT NULL            COMMENT '上传时的原始文件名，仅展示用',
  `data`          LONGBLOB        NOT NULL                COMMENT '图片二进制内容',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_media_sha256` (`sha256`),
  KEY `idx_media_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='图片媒体库';

-- ---------------------------- 登录会话 ----------------------------
CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id`     INT UNSIGNED    NOT NULL,
  `token_hash`   CHAR(64)        NOT NULL                COMMENT 'Cookie 里 token 的 sha256，库泄露也无法直接登录',
  `ip`           VARCHAR(45)     DEFAULT NULL            COMMENT '兼容 IPv6',
  `user_agent`   VARCHAR(200)    DEFAULT NULL,
  `expires_at`   DATETIME        NOT NULL,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admin_sessions_token` (`token_hash`),
  KEY `idx_admin_sessions_admin` (`admin_id`, `expires_at`),
  CONSTRAINT `fk_admin_sessions_admin` FOREIGN KEY (`admin_id`)
    REFERENCES `admins` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='后台登录会话';

-- ---------------------- articles 补列（幂等） ----------------------

SET @ddl = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND COLUMN_NAME = 'cover_image') = 0,
    'ALTER TABLE `articles` ADD COLUMN `cover_image` VARCHAR(255) DEFAULT NULL COMMENT ''封面图 URL，可为空'' AFTER `summary`',
    'DO 0'
  )
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND COLUMN_NAME = 'is_top') = 0,
    'ALTER TABLE `articles` ADD COLUMN `is_top` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''1=置顶'' AFTER `status`',
    'DO 0'
  )
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND COLUMN_NAME = 'deleted_at') = 0,
    'ALTER TABLE `articles` ADD COLUMN `deleted_at` DATETIME DEFAULT NULL COMMENT ''软删除时间，非空即视为已删除'' AFTER `published_at`',
    'DO 0'
  )
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 列表页按「未删除 + 已发布 + 置顶 + 时间」取数，补一个覆盖索引
SET @ddl = (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND INDEX_NAME = 'idx_articles_list') = 0,
    'ALTER TABLE `articles` ADD INDEX `idx_articles_list` (`deleted_at`, `status`, `is_top`, `published_at`)',
    'DO 0'
  )
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------- 站点设置 ----------------------------
-- 键值表而不是单行宽表：以后加配置项不用改结构
CREATE TABLE IF NOT EXISTS `site_settings` (
  `k`          VARCHAR(64) NOT NULL COMMENT '配置键，如 siteName',
  `v`          TEXT        NOT NULL COMMENT '配置值',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站点设置';

-- 默认值（已存在则不覆盖，重复执行安全）
INSERT IGNORE INTO `site_settings` (`k`, `v`) VALUES
  ('siteName', 'Blog_j'),
  ('author',   'cjj'),
  ('tagline',  '写后端与运维，偶尔折腾静态站点。'),
  ('since',    '2024.03'),
  ('github',   'https://github.com/cjj'),
  ('email',    'chencjj2005@outlook.com');
