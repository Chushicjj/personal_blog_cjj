-- =============================================================================
-- 个人技术博客 · 建表脚本（MySQL 8.0）
--
-- 使用前必读：
--   1. 只操作已有的 blog 库，不包含 CREATE DATABASE / CREATE USER / GRANT；
--   2. 不包含 DROP / ALTER，全部使用 CREATE TABLE IF NOT EXISTS，可重复执行；
--   3. 执行前请先确认库内没有同名表：SELECT table_name FROM information_schema.tables
--      WHERE table_schema = 'blog';
--   4. 本脚本需要手动执行，程序不会自动建表：
--      mysql -h <host> -P <port> -u <user> -p blog < sql/schema.sql
-- =============================================================================

-- ---------------------------- 分类 ----------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(50)  NOT NULL                COMMENT '分类名称，唯一',
  `slug`        VARCHAR(50)  NOT NULL                COMMENT 'URL 短标识，唯一（如 ops）',
  `description` VARCHAR(200) DEFAULT NULL            COMMENT '分类描述，可用于列表页说明',
  `sort_order`  INT          NOT NULL DEFAULT 0      COMMENT '排序值，越小越靠前',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_categories_name` (`name`),
  UNIQUE KEY `uk_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章分类';

-- ---------------------------- 标签 ----------------------------
CREATE TABLE IF NOT EXISTS `tags` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(50) NOT NULL COMMENT '标签名，唯一',
  `slug`       VARCHAR(50) NOT NULL COMMENT 'URL 短标识，唯一（如 docker）',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tags_name` (`name`),
  UNIQUE KEY `uk_tags_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章标签';

-- ---------------------------- 文章 ----------------------------
CREATE TABLE IF NOT EXISTS `articles` (
  `id`           BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `title`        VARCHAR(200)     NOT NULL              COMMENT '标题',
  `slug`         VARCHAR(200)     NOT NULL              COMMENT '详情页 URL 标识，唯一',
  `summary`      VARCHAR(500)     DEFAULT NULL          COMMENT '摘要；留空时由后端截取正文前 120 字',
  `content_md`   MEDIUMTEXT       NOT NULL              COMMENT 'Markdown 原文（权威内容，可反复重渲染）',
  `content_html` MEDIUMTEXT       DEFAULT NULL          COMMENT '服务端渲染的 HTML（含语法高亮与行号）',
  `category_id`  INT UNSIGNED     DEFAULT NULL          COMMENT '所属分类，可为空（未分类）',
  `status`       TINYINT UNSIGNED NOT NULL DEFAULT 0    COMMENT '0=草稿 1=已发布',
  `view_count`   INT UNSIGNED     NOT NULL DEFAULT 0    COMMENT '浏览量',
  `word_count`   INT UNSIGNED     NOT NULL DEFAULT 0    COMMENT '字数，用于估算阅读时长',
  `published_at` DATETIME         DEFAULT NULL          COMMENT '首次发布时间，只写一次',
  `created_at`   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_articles_slug` (`slug`),
  KEY `idx_articles_feed` (`status`, `published_at`),
  KEY `idx_articles_category` (`category_id`, `status`),
  CONSTRAINT `fk_articles_category` FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章';

-- ---------------------------- 文章-标签关联 ----------------------------
CREATE TABLE IF NOT EXISTS `article_tags` (
  `article_id` BIGINT UNSIGNED NOT NULL,
  `tag_id`     INT UNSIGNED    NOT NULL,
  PRIMARY KEY (`article_id`, `tag_id`),
  KEY `idx_article_tags_tag` (`tag_id`),
  CONSTRAINT `fk_article_tags_article` FOREIGN KEY (`article_id`)
    REFERENCES `articles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_article_tags_tag` FOREIGN KEY (`tag_id`)
    REFERENCES `tags` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章-标签关联';

-- ---------------------------- 管理员 ----------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(50)  NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'scrypt$N$r$p$salt$hash，由 scripts/hash-password.js 生成',
  `last_login_at` DATETIME     DEFAULT NULL,
  `last_login_ip` VARCHAR(45)  DEFAULT NULL COMMENT '兼容 IPv6',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admins_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='管理员账号';

-- ---------------------------- 单页内容（可选） ----------------------------
-- 若不需要在后台编辑「关于」页，可不建此表，about.html 直接写死静态内容。
-- 前端在有表时读 /api/pages/about，无表时接口返回 40400，页面自动回退。
CREATE TABLE IF NOT EXISTS `site_pages` (
  `page_key`     VARCHAR(50)  NOT NULL COMMENT '页面标识，如 about',
  `title`        VARCHAR(100) NOT NULL,
  `content_md`   MEDIUMTEXT   NOT NULL,
  `content_html` MEDIUMTEXT   DEFAULT NULL,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`page_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='单页内容（关于页等）';
