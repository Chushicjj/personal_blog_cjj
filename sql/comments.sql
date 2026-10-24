-- 文章评论
-- 与留言板（guestbook_messages）分开：评论依附于具体文章，删文章时级联删除
CREATE TABLE IF NOT EXISTS `comments` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `article_id` BIGINT UNSIGNED NOT NULL COMMENT '所属文章',
  `nickname`   VARCHAR(20)  NOT NULL COMMENT '昵称',
  `content`    VARCHAR(500) NOT NULL COMMENT '正文（纯文本，展示端转义）',
  `ip_address` VARCHAR(45)  DEFAULT NULL COMMENT '仅用于溯源，不对外返回',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comments_article` (`article_id`, `created_at`, `id`),
  CONSTRAINT `fk_comments_article` FOREIGN KEY (`article_id`) REFERENCES `articles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='文章评论';
