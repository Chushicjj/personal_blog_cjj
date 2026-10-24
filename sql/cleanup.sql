-- 废弃对象清理：tags / article_tags 已不再读写（项目只有分类，没有标签）。
-- 幂等：IF EXISTS 保证重复执行安全。

DROP TABLE IF EXISTS article_tags;
DROP TABLE IF EXISTS tags;
