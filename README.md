# Blog_j · cjj 的个人技术博客

展示页静态托管、内容由数据库驱动、带一套自建后台的个人博客。文章存在 MySQL 里，用 Markdown 写、由后端渲染成 HTML 直出；图片以二进制存库并内容寻址输出；后台可发布/修改/下线文章、管理图片与分类。

- 后端：Express 5 + mysql2 + markdown-it + multer + sanitize-html（CommonJS，无 TypeScript、无构建步骤）
- 前端：手写 HTML/CSS/JS，无框架、无 CDN、无 Web 字体、无动画库
- 数据库：MySQL 8.0，沿用已有的 `blog` 库

---

## 1. 三条链路

```
浏览器
├─ 静态页面   → Nginx 直接读 /var/www/blog（首页 / 列表 / 关于 / 留言）
├─ 文章页     → /posts/:slug 反代到 Express，服务端直出完整 HTML
└─ 数据       → /api/* 反代到 Express → MySQL
                 图片 /media/xxx.png ← 从 MySQL 的 LONGBLOB 读出
```

文章**不再**是 `public/posts/*.html`：每篇一个 slug，内容在 `articles` 表，`content_md` 为权威原文，`content_html` 为渲染结果（改渲染规则后可一键重建）。

---

## 2. 目录结构

```
blog/
├─ app.js                     # 入口：装配日志/路由/静态资源 + 优雅退出
├─ config/env.js              # 环境变量统一读取与校验（缺必需项直接启动失败）
├─ db/index.js                # 连接池（单例）+ query/queryOne/withTransaction/ping
├─ data/uploads/              # 本地上传的视频（volume 挂载；图片仍存数据库）
├─ middlewares/
│  ├─ request-log.js          # 每个请求一行 JSON 日志 + X-Request-Id
│  ├─ require-admin.js        # 后台鉴权（Cookie → admin_sessions）
│  ├─ attach-user.js          # 访客会话（可选鉴权，不拦截）
│  ├─ not-found.js
│  └─ error-handler.js
├─ routes/
│  ├─ index.js                # 路由挂载表
│  ├─ health.js               # 探活（服务 + 数据库）
│  ├─ messages.js             # 留言提交 / 分页查询
│  ├─ articles.js             # 公开文章接口
│  ├─ auth.js                 # 访客注册 / 登录 / 登出 / me
│  ├─ archive.js              # 归档数据
│  ├─ seo.js                  # sitemap.xml 与 feed.xml
│  ├─ settings.js             # 公开站点设置
│  ├─ pages.js                # 公开单页内容
│  ├─ posts.js                # GET /posts/:slug 服务端渲染
│  ├─ page.js                 # GET /p/:key 自定义页面直出
│  ├─ media.js                # GET /media/:file 从库里读图
│  └─ admin/
│     ├─ index.js             # /api/admin/* 总入口（登录后统一鉴权）
│     ├─ auth.js              # 登录 / 登出 / 当前用户
│     ├─ articles.js          # 文章 CRUD、状态流转、预览、批量重建
│     ├─ media.js             # 上传 / 列表 / 删除
│     ├─ videos.js            # 视频上传 / 列表 / 删除
│     ├─ messages.js          # 留言列表 / 搜索 / 单删 / 批量删
│     ├─ comments.js          # 文章评论列表 / 单删 / 批量删
│     ├─ users.js             # 访客账号：列表 / 禁用 / 删除
│     ├─ taxonomy.js          # 分类维护（标签已移除）
│     ├─ settings.js          # 站点设置读写
│     └─ pages.js             # 单页读写（关于页等）
├─ services/
│  ├─ articles.js             # 文章读写与分类关联（前台后台共用）
│  ├─ media.js                # 图片存取（换 OSS 只改这里）
│  ├─ videos.js               # 视频文件落磁盘（文件头校验/归档/删除）
│  ├─ comments.js             # 文章评论读写
│  ├─ users.js                # 访客账号与登录会话
│  ├─ settings.js             # 站点设置键值表（含默认值兜底）
│  └─ pages.js                # 单页读写
├─ views/
│  ├─ post.js                 # 文章页 HTML 模板
│  └─ page.js                 # 自定义页面 HTML 模板
├─ utils/                     # logger / response / validate / markdown / password / cookies / throttle
├─ scripts/
│  ├─ migrate.js              # 执行 sql/*.sql
│  ├─ seed-posts.js           # 把 seed/posts/*.md 导入数据库
│  ├─ seed-pages.js           # 把 seed/pages/*.md 导入数据库
│  ├─ backup.js               # 数据库 dump + 上传目录打包
│  └─ hash-password.js        # 生成后台密码哈希（输出 SQL 或 --apply 直接写库）
├─ seed/
│  ├─ posts/*.md              # 存量文章（front-matter + Markdown）
│  └─ pages/*.md              # 单页内容（关于页）
├─ sql/
│  ├─ guestbook.sql           # 留言表
│  ├─ comments.sql            # 文章评论表（FK 级联，删文章即删评论）
│  ├─ users.sql               # 访客账号表 + 会话表 + comments.user_id
│  ├─ admin.sql               # media / admin_sessions / articles 补列
│  └─ schema.sql              # 历史脚本：分类/标签/文章/管理员表
├─ public/
│  ├─ index.html              # 首页（双卡片由接口填充）
│  ├─ posts.html              # 文章列表（接口取数 + 分类筛选 + 搜索）
│  ├─ archive.html            # 归档（按年月）
│  ├─ account.html            # 登录 / 注册
│  ├─ guestbook.html / about.html / 404.html
│  ├─ admin/                  # 后台：登录 / 文章 / 留言 / 媒体库 / 设置
│  └─ assets/{css,js}/
├─ deploy/nginx/blog.conf     # Nginx 静态托管 + /api /media /posts 反代
├─ Dockerfile                 # 多阶段构建
└─ docker-compose.yml
```

---

## 3. 本地启动

### 3.1 安装依赖

```bash
npm install
```

### 3.2 配置环境变量

```dotenv
SERVER_PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=<现有用户>
DB_PASSWORD=<现有密码>
DB_NAME=blog
DB_POOL_SIZE=10
DB_TIMEZONE=+08:00
LOG_LEVEL=info
LOG_TO_FILE=false
```

### 3.3 建表（幂等，可重复执行）

```bash
npm run migrate
# 等价于 node scripts/migrate.js，依次执行 guestbook、comments、users、admin、cleanup、fulltext
```

`admin.sql` 只做三件事：建 `media`、建 `admin_sessions`、给 `articles` 补 `cover_image / is_top / deleted_at` 三列。`cleanup.sql` 删除废弃的 `tags / article_tags` 两张表（项目只有分类没有标签）。`fulltext.sql` 给 `articles(title, summary, content_md)` 建 ngram 全文索引，前台搜索词长 ≥2 时走 MATCH AGAINST；索引未建时自动回退 LIKE，功能不受影响。

### 3.4 设置后台账号

```bash
npm run hash-password -- admin 你的新密码
```

脚本会打印一条 `INSERT ... ON DUPLICATE KEY UPDATE`，复制执行即可（已有 `admin` 账号时等于重置密码）。密码用 scrypt 存哈希，格式 `scrypt$N$r$p$salt$hash`。

### 3.5 导入存量文章（可选）

```bash
npm run seed              # 已存在同 slug 的跳过
npm run seed -- --force   # 覆盖已有文章的正文与分类

npm run seed:pages        # 导入 seed/pages/*.md（关于页）
```

### 3.6 启动

```bash
npm run dev     # nodemon
# 或 npm start
```

跑测试（node:test，不需要真实数据库）：

```bash
npm test        # 渲染管线 / XSS / @video / 限流 / 可见性条件 / media 缓存 / 全文搜索回退
```

- 前台 <http://localhost:3000>
- 后台 <http://localhost:3000/admin/>
- 探活 <http://localhost:3000/health>

---

## 4. 后台怎么用

| 页面    | 地址                     | 能做什么                                             |
| ----- | ---------------------- | ------------------------------------------------ |
| 登录    | `/admin/login.html`    | 账号密码登录，会话 7 天                                    |
| 文章列表  | `/admin/`              | 搜索、按状态筛选、发布/转为草稿、删除、看数据概览                        |
| 编辑器   | `/admin/editor.html`   | 写 Markdown、实时预览、插图/视频、封面、分类、发布时间（含定时）、置顶         |
| 留言与评论 | `/admin/messages.html` | 三个标签页：留言板 / 文章评论 / 注册用户。评论可看所属文章，用户可禁用（立即踢下线）或删除 |
| 媒体库   | `/admin/media.html`    | 上传（点击或拖拽）、复制图片链接、删除                              |
| 单页    | `/admin/pages.html`    | 关于页与自定义页面的 Markdown 编辑，支持新建 `/p/:key`            |
| 站点设置  | `/admin/settings.html` | 头像、站点名、作者、简介、建站时间、GitHub、邮箱，保存即生效                |

编辑器要点：

- **左侧写、右侧实时预览**，预览走的是和正式发布完全相同的渲染管线，不存在「预览好看、上线变样」
- 工具栏 `插入图片` 或**直接 Ctrl+V 粘贴截图**，上传后自动插入 `![alt](/media/xxx.png)`
- 工具栏 `上传视频`：选本地文件直接传，边传边显示百分比（默认上限 100MB，见 `VIDEO_MAX_MB`）
- 工具栏 `视频链接`：粘贴 B 站 / YouTube 的**页面链接**即可，自动换成播放器；也支持 `.mp4` 直链
- `Ctrl/Cmd + S` 保存；已发布的文章点「保存」保持发布状态，不会误转草稿
- 摘要留空则自动截取正文前 120 字
- 分类下拉最后一项是「＋ 新建分类…」，选中就能当场建；下方「管理分类」展开面板，列出全部**分类 + 各自篇数**，每行可重命名或删除。删分类只把文章转成未分类，文章本身不会删
- 「发布时间」留空则发布时取当前时间；填一个**未来时间就是定时发布**——文章状态仍是已发布，但前台要等时间到了才出现，列表里会显示「定时」徽标
- 有未保存修改时关闭页面会提示

关于页头像：在「站点设置」里上传，前台显示在标题左侧的圆形位；**没有上传时自动显示作者名首字母**（如 cjj → CJ），不会出现裂图或空洞。建议用正方形图片，展示时按 `object-fit: cover` 裁成圆形。

---

## 5. 接口

统一返回 `{ code, message, data }`，`code=0` 成功。

### 5.1 公开

| 方法   | 路径                             | 说明                                                                                           |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| GET  | `/health`                      | 服务 + 数据库状态（DB 挂返回 503）                                                                       |
| GET  | `/api/articles`                | 文章列表：`category`（分类 slug）、`q`（标题/摘要/正文模糊搜索）、`page`、`pageSize`，返回 `list/categories/pagination` |
| GET  | `/api/archive`                 | 按年月分组的归档数据                                                                                   |
| GET  | `/sitemap.xml`                 | 站点地图（首页/列表/归档/关于/留言 + 全部文章 + 自定义页）                                                           |
| GET  | `/feed.xml`                    | RSS 2.0，最近 20 篇                                                                              |
| GET  | `/api/articles/:slug`          | 文章详情（含 `contentHtml`、上下篇）                                                                    |
| GET  | `/posts/:slug`                 | 文章页 HTML（服务端直出，带 OG 标签）                                                                      |
| GET  | `/media/:sha256.:ext`          | 图片，`Cache-Control: immutable` 一年                                                             |
| GET  | `/uploads/:path`               | 本地上传的视频文件，支持 Range（拖动进度条）                                                                    |
| GET  | `/api/settings`                | 站点名 / 作者 / 简介 / 建站时间 / GitHub / 邮箱                                                           |
| GET  | `/api/pages/:key`              | 单页内容（`about` 等），返回渲染后的 HTML                                                                  |
| GET  | `/p/:key`                      | 自定义页面 HTML（服务端直出）                                                                            |
| GET  | `/api/messages`                | 留言分页：`page`、`pageSize`（上限 20）                                                                |
| POST | `/api/messages`                | 提交留言：`{ nickname, content }`                                                                 |
| GET  | `/api/articles/:slug/comments` | 文章评论分页（倒序，最新在前）                                                                              |
| POST | `/api/articles/:slug/comments` | 发表评论：`{ content }`，**必须登录**；昵称取自账号不接受前端传值；同 IP 15 秒一条                                        |
| GET  | `/api/auth/me`                 | 当前登录用户；未登录返回 `{ user: null }`（不返回 401）                                                       |
| POST | `/api/auth/register`           | `{ username, password, nickname? }`，注册后直接登录                                                  |
| POST | `/api/auth/login`              | `{ username, password }`，10 分钟内错 5 次锁该 IP+账号                                                 |
| POST | `/api/auth/logout`             | 退出并删除服务端会话                                                                                   |

### 5.2 后台（需登录，Cookie 失效返回 40100）

| 方法                | 路径                                     | 说明                                               |                      |
| ----------------- | -------------------------------------- | ------------------------------------------------ | -------------------- |
| POST              | `/api/admin/login`                     | `{ username, password }`                         |                      |
| POST              | `/api/admin/logout`                    | 退出并删除服务端会话                                       |                      |
| GET               | `/api/admin/me`                        | 当前账号                                             |                      |
| GET               | `/api/admin/stats`                     | 文章/草稿/阅读/图片/留言概览                                 |                      |
| GET               | `/api/admin/articles`                  | 列表：`status`、`q`、`page`、`pageSize`                |                      |
| GET               | `/api/admin/articles/:id`              | 单篇（含 Markdown 原文）                                |                      |
| POST              | `/api/admin/articles`                  | 新建                                               |                      |
| PUT               | `/api/admin/articles/:id`              | 编辑                                               |                      |
| PATCH             | `/api/admin/articles/:id/status`       | `{ status: 0\|1 }`                               |                      |
| DELETE            | `/api/admin/articles/:id`              | 软删除（`deleted_at`，可恢复）                            |                      |
| POST              | `/api/admin/articles/preview`          | `{ contentMd }` → `{ html, wordCount }`          |                      |
| POST              | `/api/admin/articles/rebuild`          | 按当前规则重建全部 `content_html`                         |                      |
| POST              | `/api/admin/media/upload`              | multipart，字段名 `file`                             |                      |
| GET               | `/api/admin/media`                     | 图片列表（不含二进制）                                      |                      |
| DELETE            | `/api/admin/media/:id`                 | 被引用时返回 40900，加 `?force=1` 强删                     |                      |
| POST              | `/api/admin/videos/upload`             | multipart，字段名 `file`，上限 `VIDEO_MAX_MB`（默认 100MB） |                      |
| GET               | `/api/admin/videos`                    | 视频列表（文件名、大小、上传时间）                                |                      |
| DELETE            | `/api/admin/videos?path=...`           | 删除视频文件                                           |                      |
| GET               | `/api/admin/taxonomy`                  | 分类列表（含各自文章数）                                     |                      |
| POST/PATCH/DELETE | `/api/admin/taxonomy/categories[/:id]` | 分类增改删                                            |                      |
| GET               | `/api/admin/messages`                  | 留言列表：`q`（昵称/内容）、`page`、`pageSize`                |                      |
| DELETE            | `/api/admin/messages/:id`              | 删除单条                                             |                      |
| POST              | `/api/admin/messages/batch-delete`     | `{ ids: [] }`，单次上限 100 条                         |                      |
| GET               | `/api/admin/comments`                  | 评论列表（含所属文章标题与 slug）：`q`、`page`、`pageSize`        |                      |
| DELETE            | `/api/admin/comments/:id`              | 删除评论                                             |                      |
| POST              | `/api/admin/comments/batch-delete`     | `{ ids: [] }`，单次上限 100 条                         |                      |
| GET               | `/api/admin/users`                     | 访客账号列表（含评论数、最后登录）：`q`、`page`、`pageSize`          |                      |
| PATCH             | `/api/admin/users/:id/status`          | \`{ status: 0                                    | 1 }\`，禁用会立刻删除该用户所有会话 |
| DELETE            | `/api/admin/users/:id`                 | 删除账号；其评论保留（`user_id` 置空）                         |                      |
| GET               | `/api/admin/settings`                  | 读取站点设置                                           |                      |
| PUT               | `/api/admin/settings`                  | 保存站点设置（校验邮箱与 URL 格式）                             |                      |
| GET               | `/api/admin/pages`                     | 单页列表                                             |                      |
| GET               | `/api/admin/pages/:key`                | 单页详情（含 Markdown）                                 |                      |
| PUT               | `/api/admin/pages/:key`                | 新建 / 覆盖单页                                        |                      |
| DELETE            | `/api/admin/pages/:key`                | 删除单页（`about` 受保护，不可删）                            |                      |


错误码：`40001` 参数错误、`40100` 未登录、`40101` 账号密码错误、`40400` 不存在、`40900` 冲突、`42900` 登录过于频繁、`50000` 服务器错误（含 requestId）、`50300` 数据库不可用。

---

## 6. 图片方案与代价

图片以 `LONGBLOB` 存 `media` 表，按 **sha256 内容寻址**：

- 同一张图重复上传只存一份，URL 就是 `/media/<sha256>.<ext>`
- 因为内容变则 URL 变，所以可以发一年期 `immutable` 强缓存，彻底避开「缓存了旧图」
- 上传校验文件头（PNG/JPEG/GIF/WebP/AVIF），**不支持 SVG**（SVG 可内嵌脚本）；单张上限 5MB；客户端声明的 MIME 一律不信

代价要清楚：

1. 图片必须经 Node 从库里读出，**Nginx 无法直出**（进程内有 64MB LRU 读缓存，命中时不查库，但首次读取与缓存未命中仍占后端带宽）
2. 库体积随图片线性增长，备份/迁移变慢
3. 建议在 `deploy/nginx/blog.conf` 里给 `/media/` 打开 `proxy_cache`，或后续换对象存储

`services/media.js` 是唯一与存储介质耦合的文件，换 OSS/S3 时只需要改 `save` / `read` 两个函数。

### 视频为什么反过来存磁盘

|    | 图片                           | 视频                                   |
| -- | ---------------------------- | ------------------------------------ |
| 体积 | ≤ 5MB                        | 几十 MB ～ 上百 MB                        |
| 存储 | `media` 表 LONGBLOB           | `<UPLOAD_DIR>/video/YYYY/MM/`        |
| 地址 | `/media/<sha256>.<ext>`，内容寻址 | `/uploads/video/YYYY/MM/<随机名>.<ext>` |
| 缓存 | 一年 immutable                 | 一年 immutable（文件名随机，不会复用）             |

视频不进库的两个理由：MySQL 的 `max_allowed_packet` 默认 16–64MB，稍大的视频直接写不进去；即使调大，几十个视频就能让数据库备份从几十 MB 涨到几 GB。

磁盘方案的关键点：

- `express.static` 自带 **Range** 支持，浏览器才能拖动进度条（已测 206）
- 文件头校验：MP4/MOV 看 `ftyp`、WebM/MKV 看 EBML、OGV 看 `OggS`；AVI 直接拒绝（浏览器放不了）
- 文件名由服务端随机生成，删除接口只接受 `video/YYYY/MM/<16位hex>.<ext>` 形式的相对路径，杜绝 `../` 穿越
- 容器部署必须把 `./data` 挂到 `/app/data`，否则重建容器视频全丢

---

## 7. 内容维护

| 想改什么                                    | 改哪里                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 文章                                      | 后台 `/admin/`，或往 `seed/posts/` 放 `.md` 再 `npm run seed`                                                                          |
| 头像 / 站点名 / 作者 / 简介 / 建站时间 / GitHub / 邮箱 | 后台「站点设置」页，保存即生效（接口不可用时回退到 `public/assets/js/config.js`）                                                                         |
| 整体配色                                    | `public/assets/css/base.css` 顶部 `:root` 的 `--bg / --hero-bg / --panel-* / --text / --hair`，深色模式在 `html[data-theme="dark"]` 同段改写 |
| 首页大标题 / 底纹 / 翻转卡                        | `public/index.html` 的 `.hero-*`                                                                                                 |
| 关于页                                     | 后台「单页」页，内容存 `site_pages` 表；`public/about.html` 只保留静态壳与兜底内容                                                                      |
| 后台样式                                    | `public/admin/admin.css`                                                                                                        |

新增文章的 Markdown 约定（代码块行号与高亮由 CSS 自动完成，无需手写 span）：

````markdown
## 二级标题

正文，支持 **加粗**、`行内代码`、[链接](https://example.com)。

```js
const answer = 42;
```

| 列一 | 列二 |
| --- | --- |
| 值 | 值 |

> 引用

![图片说明](/media/<sha256>.png)

@video https://www.bilibili.com/video/BV1xx411c7mD
@video https://youtu.be/xxxxxxxxxxx | 手机录的一段演示
@video https://cdn.example.com/demo.mp4
@video /uploads/video/2026/10/a1b2c3d4e5f6a7b8.mp4 | 本地上传的文件
````

`@video` 必须独占一行（行首），后面可跟 `| 说明文字` 作为图注。渲染规则：

| 地址                                                 | 结果                         |
| -------------------------------------------------- | -------------------------- |
| `bilibili.com/video/BV…` 或 `av…`                   | B 站播放器 iframe（16:9，禁止自动播放） |
| `youtube.com/watch?v=` / `youtu.be/`               | `youtube-nocookie` 播放器     |
| 以 `.mp4 / .webm / .ogg / .mov` 结尾，或站内 `/uploads/…` | 原生 `<video controls>`      |
| 其它地址                                               | 降级成一个外链，不会硬塞 iframe        |

只有 B 站与 YouTube 会生成 iframe，正文里无法插入任意站点的嵌入框。视频**不经过本站存储**——省磁盘也省带宽，代价是依赖平台可用性。

---

## 8. 视觉与动效

整体 1:1 参照 mimo.xiaomi.com 首页的版式：**顶部导航 + 满屏 hero（重复文字底纹 + 黑圆 + 标题挖空）+ 左右双卡片**，单色、超大标题、等宽小字、细线分区。全部原生 CSS + 少量 JS，统一缓动 `--ease: cubic-bezier(0.16, 1, 0.3, 1)`。

| 位置       | 效果                                              | 实现                                                                        |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| 黑色描边框    | 首屏与双卡片共用一圈 1px 黑色外框（左右留 8px）                    | `.home-frame` + `--frame` 变量，深色模式自动反转                                     |
| 首屏底纹     | 8 行 `CJJ` 重复文字铺满，`letter-spacing: 0.85em` 让字距松散 | `.hero-pattern` 绝对定位 + `space-between`                                    |
| 黑圆挖空     | 鼠标进入首屏后从指针位置浮出黑圆，圆内显示中文                         | 两层标题 + `clip-path: circle()` 跟随 `--mx/--my`                               |
| 圆内「透镜」   | 圆内底纹更细密，强化放大镜错觉                                 | `.hero-lens` 克隆底纹并缩小字号，共用同一 clip-path                                     |
| 首屏翻转卡    | 双击绕横轴中线 3D 翻面，`Enter`/`Space` 同样可翻              | `data-flip` + `backface-visibility: hidden`                               |
| 顶部导航     | hover / 当前页下划线滑入                                | `::after` 的 `scaleX(0→1)`                                                 |
| 透明页头     | 静止时完全透明，内容从下方透上来；滚动超过 8px 才出现半透明底 + 毛玻璃         | `.site-header` 无底色；`is-scrolled` 由 `shell.js` 的滚动监听切换                     |
| 首页悬浮导航   | 首页页头改为 `position: fixed`，首屏底纹直接垫在导航下面           | `body.home .site-header`                                                  |
| Build 区块 | 行悬停整行反黑、文字转浅、箭头右移                               | `.build-row` 共用 `--frame` / `--on-frame*` 令牌                              |
| 双卡片      | hover 整块反色                                      | 背景切到 `--frame`，前景用 `--on-frame*`                                          |
| 文章列表行    | hover 整行反黑：标题转浅、摘要与标签换色、编号和箭头提亮                 | 与首页双卡片/Build 行共用 `--frame` / `--on-frame` 令牌                              |
| 文章列表外框   | 列表整体一圈 1px 黑框，文章之间用黑线分隔（和首页 `.home-frame` 同款）   | `.post-list:has(> .post-card)`，空态/加载中不画框                                  |
| 代码块      | hover 边框加深、复制按钮淡入                               | `opacity/transform` + `is-copied` 动画                                      |
| 主题切换     | 三态循环：跟随系统 → 深色 → 浅色；切换时背景/文字/边框 420ms 渐变        | 未选择时读 `prefers-color-scheme` 并监听变化，选中后写入 localStorage；切换瞬间挂 `.theme-anim` |
| 图片放大     | 点正文图全屏预览，Esc / 点背景 / 右上 × 关闭，带缩放过渡              | `shell.js` 的 `initLightbox()` 懒插 `.lightbox`，只接管 `.article-body img`      |

鼠标保持系统原生指针；`prefers-reduced-motion: reduce` 下动画与平滑滚动全部关闭。

---

## 9. 服务器部署

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

- 容器只监听 `127.0.0.1:3000`，公网必须经过 Nginx
- `restart: always` + `healthcheck` 每 30s 打 `/health`
- `env_file: .env` 复用宿主机配置，容器内不存 `.env`
- 数据库不容器化：同机用 `host.docker.internal`
- 图片在数据库里，不用挂目录；**视频在 `./data`，必须挂载到 `/app/data`**，否则重建容器就丢
- `./logs` 仍挂到 `/app/logs`

Nginx 有五处变化（`deploy/nginx/blog.conf` 已改好）：

```bash
sudo cp deploy/nginx/blog.conf /etc/nginx/conf.d/blog.conf
sudo mkdir -p /var/www/blog && sudo cp -r public/* /var/www/blog/
sudo nginx -t && sudo systemctl reload nginx
```

1. `location ^~ /posts/` 反代到后端（文章页直出）
2. `location ^~ /p/` 反代到后端（自定义单页直出）
3. `location ^~ /uploads/` 反代到后端（本地视频，必须透传 Range 并 `proxy_buffering off`）
4. `location ^~ /media/` 反代到后端（图片从库里读）；用 `^~` 是为了压过「静态资源后缀」正则，否则 `.png` 会被当成磁盘文件去找
5. `location /admin/` 加 `X-Robots-Tag: noindex`

首次部署记得先 `npm run migrate`（或在容器外连库执行 `sql/admin.sql`），并设置管理员账号。

---

### 备份

```bash
npm run backup                              # 数据库 dump + data/uploads 打包 → ./backups
BACKUP_DIR=/data/bak npm run backup         # 换目录
BACKUP_KEEP_DAYS=30 npm run backup          # 换保留天数（默认 7）
```

产物是 `db-YYYYMMDD-HHmm.sql.gz` 与 `uploads-YYYYMMDD-HHmm.tar.gz`。

- 依赖外部的 `mysqldump` 与 `tar`；缺了会打印替代命令，**不会留一个 0 字节的假备份**
- 恢复：`gunzip -c db-xxx.sql.gz | mysql -u用户 -p blog`，再把 uploads 解到 `data/`
- 建议 cron 每天凌晨跑：`0 3 * * * cd /srv/blog && npm run backup >> logs/backup.log 2>&1`

## 10. 常见问题

| 现象                    | 原因与处理                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| 后台登录提示「账号或密码不正确」      | 用 `npm run hash-password -- admin 新密码` 重置                                         |
| 后台一直跳回登录页             | Cookie 被清或会话过期（7 天）；HTTPS 下若 `NODE_ENV` 不是 production，`Secure` 不会加，属正常            |
| 文章页 404               | 文章是草稿、或 `published_at` 未来时间、或 slug 拼错                                             |
| 列表页一直显示"正在加载"         | `/api/articles` 不可达，先看 `curl /health`                                             |
| 图片显示裂图                | 该图被强制删除；或 Nginx 没配 `/media/` 反代（会去磁盘找文件）                                          |
| 上传报「只支持 PNG / JPEG…」  | 文件头校验不通过（改后缀的伪造图片、或 SVG）                                                          |
| 文章里的视频只有一块白色区域        | B 站/YouTube 被网络或广告拦截插件挡住；播放器本身是 iframe，页面加载后才会出现                                  |
| `@video` 没有生效、原样显示成文字 | 指令必须**独占一行**且行首无空格；写在句子中间或代码块里不会解析                                                |
| 上传视频提示「超过 100MB 上限」   | 调 `.env` 的 `VIDEO_MAX_MB` 后重启；同时确认 Nginx `client_max_body_size` 不小于它              |
| 视频能播但不能拖进度条           | 反向代理没透传 Range，或 `proxy_buffering on`；按 `deploy/nginx/blog.conf` 的 `/uploads/` 段配置 |
| 重启容器后视频全没了            | `./data` 没挂到 `/app/data`，视频写在容器临时层里                                               |
| 文章页评论区不显示             | 评论表没建：`npm run migrate comments`；或文章本身未发布（评论区只挂在已发布文章上）                           |
| 评论提示「发得太快了」           | 同 IP 15 秒一条的内存限流，等几秒即可；重启进程会清空计数                                                  |
| 评论提示「请先登录后再评论」        | 评论需要访客账号，去 `/account.html`（页脚「账号」或评论区按钮）注册                                        |
| 忘记密码了                 | 目前没有找回流程。管理员可在后台「注册用户」里删掉该账号让对方重新注册（旧评论会保留）                                       |
| 想封掉某个人的评论权限           | 后台「注册用户」→ 禁用：会话立即失效，该账号也无法再登录                                                     |
| 删掉文章后评论还在吗            | 不在了，`comments` 的外键是 `ON DELETE CASCADE`，级联删除                                      |
| 留言时间差 8 小时            | 设置 `DB_TIMEZONE=+08:00` 后重启（连接池建连时 `SET time_zone`）                               |
| 改了渲染规则想批量生效           | `POST /api/admin/articles/rebuild`                                                |
| 搜索搜不到正文里的词            | 词长 ≥2 走 ngram 全文索引（先跑 `npm run migrate` 建索引）；索引未建或单字搜索自动回退 `LIKE %词%` 匹配标题/摘要/正文  |
| 归档页/RSS 是空的           | 只包含「已发布且发布时间 ≤ 现在」的文章；草稿和定时未到的不会出现                                                |
| 定时文章到点了还没出现           | 列表与详情都按 `NOW()` 判断，刷新即可；确认服务器时区与 `DB_TIMEZONE` 一致                                 |
| 备份脚本报找不到 mysqldump    | 装 MySQL 客户端，或用 `docker exec <mysql容器> mysqldump ...` 代替                           |
| 后台改了站点名，前台还是旧的        | 强刷一次；若 `/api/settings` 超过 2 秒未返回，页面会用 `config.js` 的兜底值                            |
| 后台改了关于页，前台没变          | `about.html` 是静态壳 + 接口填充，接口空时会显示壳里的兜底内容；确认 `GET /api/pages/about` 有返回，再强刷         |

> 页面挂载顺序：`config.js`（兜底默认值）→ `settings.js`（拉接口覆盖 `window.BLOG_CONFIG` 并填充 `[data-site-name]` 等节点）→ `shell.js`（等 `BLOG_SETTINGS_READY` 落地后再渲染页脚与社交链接），所以不会出现文案先闪一下再变的情况。

---

## 11. 安全提醒

- `.env` 不进 Git、不进镜像；后台会话只存 token 的 sha256，Cookie 为 `HttpOnly + SameSite=Lax`
- 登录失败 10 分钟内 5 次即锁定该 IP+账号组合，防暴力破解
- 正文 Markdown 禁用裸 HTML，渲染后再过一遍 `sanitize-html`，两道关防 XSS
- 图片按文件头校验类型、拒绝 SVG，避免同源脚本注入
- 留言内容原样入库、前端统一转义；访客 IP 只落库不返回
- 后台没有验证码与 CSRF token，靠 `SameSite=Lax` + 同源部署兜底；若要公网长期暴露，建议再加一层 IP 白名单或 Basic Auth
- 全站统一安全响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy`、`Permissions-Policy`；生产环境走 HTTPS 时额外发 HSTS。没上 CSP 是因为模板里有内联主题脚本，硬加会白屏
- 留言板与文章评论都有「同 IP 15 秒一条」的内存限流，脚本刷不满页
- 日志按天分文件（`logs/app-YYYY-MM-DD.log`），只保留最近 14 天，切换当天自动清理旧文件
- 访客账号与后台账号是两套完全隔离的会话（`blog_user` / `blog_admin`），禁言或删号都不会影响后台登录；评论的昵称由服务端从会话取，前端传什么都无效，避免冒充
