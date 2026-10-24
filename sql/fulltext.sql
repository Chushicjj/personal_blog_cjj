-- 文章搜索：给 articles(title, summary, content_md) 建 ngram 全文索引。
-- ngram 对中文按二字切词（ngram_token_size 默认 2），前台搜索长词走 MATCH AGAINST。
-- 幂等：先查 information_schema，已存在则跳过（重复 ALTER 会报 Duplicate key name）。

SET @ft_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'articles'
     AND index_name = 'ft_articles_search'
);
SET @ft_sql := IF(@ft_exists = 0,
  'ALTER TABLE articles ADD FULLTEXT INDEX ft_articles_search (title, summary, content_md) WITH PARSER ngram',
  'SELECT ''ft_articles_search 已存在，跳过'' AS note'
);
PREPARE stmt FROM @ft_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
