# syntax=docker/dockerfile:1

# 基础镜像固定到具体补丁版本 + 具体发行版，不使用 latest / 漂移标签。
# 若该 tag 在你的服务器上不存在，只改这一行（并在两处保持一致）：
#   docker buildx imagetools inspect node:24.22.0-bookworm-slim
ARG NODE_IMAGE=node:24.22.0-bookworm-slim

# ------------------------------ 阶段 1：依赖 ------------------------------
# 前端是纯静态文件、没有构建步骤，这一阶段专门用来产出「只含生产依赖」的 node_modules。
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ------------------------------ 阶段 2：运行 ------------------------------
FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production \
    SERVER_PORT=3000 \
    TZ=Asia/Shanghai \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

# 只装运行期需要的东西：生产依赖 + 业务代码 + 静态资源
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node app.js ./
COPY --chown=node:node config ./config
COPY --chown=node:node db ./db
COPY --chown=node:node middlewares ./middlewares
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node views ./views
COPY --chown=node:node utils ./utils
COPY --chown=node:node public ./public

RUN mkdir -p /app/logs /app/data/uploads && chown -R node:node /app/logs /app/data

# 非 root 运行
USER node

EXPOSE 3000

# 用 node 自带 http 探测，镜像里不需要额外装 curl/wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.SERVER_PORT || 3000) + '/health', function (res) { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', function () { process.exit(1); })"

CMD ["node", "app.js"]
