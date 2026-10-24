---
title: Docker 多阶段构建为什么能瘦身一半
slug: docker-multi-stage
summary: 把「装依赖」和「跑服务」拆成两个阶段，最终镜像只留运行期需要的东西：体积从 1.1 GB 降到 210 MB。
publishedAt: 2026-10-18 09:00:00
viewCount: 128
tags: Docker, 运维
---

最终镜像里如果还带着 devDependencies、npm 缓存和构建链，体积很容易翻几倍。多阶段构建解决的就是这件事：把「装依赖」和「跑服务」拆成两个阶段，只有运行期需要的东西进入最终镜像。

## 单阶段的问题

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "app.js"]
```

这版镜像里有什么：完整的 `node_modules`、npm 缓存、`.git`、测试文件。一个纯 API 服务轻松 1.1 GB。

## 拆成两个阶段

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
CMD ["node", "app.js"]
```

关键点三个：

- `deps` 阶段只负责装依赖，`--omit=dev` 把开发依赖挡在外面
- `runtime` 阶段用 `COPY --from` 只拿 `node_modules`，不带 npm 缓存
- `USER node` 让进程以非 root 运行，少一个提权面

## 体积对比

| 方案 | 体积 | 冷启动 |
| --- | --- | --- |
| 单阶段 | 1.1 GB | 4.2s |
| 多阶段 | 210 MB | 1.8s |

> 体积变小不只是「好看」：它直接决定镜像拉取时间和节点扩容速度。

## 两个容易忽略的细节

1. `COPY package*.json` 要放在 `COPY . .` 之前，利用层缓存；只改业务代码时不会重新装依赖
2. `.dockerignore` 里排除 `node_modules`、`.env`、`logs`，否则本地依赖会被打进构建上下文，既慢又容易泄露配置
