---
title: 一次 MySQL 慢查询排查记录
slug: mysql-slow-query
summary: 线上接口偶发超时，最后落在一条按状态筛选的分页 SQL 上：扫描 4.8 万行变成 10 行，耗时从 182ms 降到 0.9ms。
publishedAt: 2026-09-27 20:00:00
viewCount: 96
tags: MySQL, 排查
---

线上接口偶发超时，慢查询日志里定位到一条按状态筛选的分页 SQL。把排查顺序记下来，下次不用重新想。

## 先看执行计划

```sql
EXPLAIN ANALYZE
SELECT id, title, published_at
FROM articles
WHERE status = 1
ORDER BY published_at DESC
LIMIT 10;
```

输出里 `type=ALL`、`rows=48213`，说明在扫全表。`status` 只有 0 和 1 两个值，单列索引选择性太差，真正需要的是 `(status, published_at)` 联合索引。

## 加索引前后

| 指标 | 加索引前 | 加索引后 |
| --- | --- | --- |
| 扫描行数 | 48213 | 10 |
| 耗时 | 182ms | 0.9ms |

## 为什么是这个顺序

联合索引 `(status, published_at)` 同时满足「等值过滤 + 排序」：`status` 先定位到已发布区间，`published_at` 在区间内天然有序，`ORDER BY` 不再需要额外排序。

反过来 `(published_at, status)` 就退化了：先按时间扫，再逐行判断状态，等于白建。

## 收尾

```bash
mysql -e "SHOW INDEX FROM articles\G" | grep -A4 idx_articles_feed
mysql -e "SHOW GLOBAL STATUS LIKE 'Slow_queries'"
```

`Slow_queries` 计数还在涨，说明还有别的语句没优化，别只盯着这一条。
