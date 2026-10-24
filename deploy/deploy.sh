#!/usr/bin/env bash
#
# Blog_j 一键发布脚本（Ubuntu + systemd + Nginx）
#
#   用法：
#     sudo bash deploy.sh /tmp/blog.tar.gz      # 发布一个新版本
#     sudo bash deploy.sh --rollback            # 回滚到上一个版本
#     sudo bash deploy.sh --status              # 只看状态，不改动任何东西
#
#   设计前提（重要）：
#     代码在 /srv/blog，用户数据在 /srv/data（上传文件、日志），备份在 /srv/backup。
#     把三者分开之后，替换代码目录不会碰到任何用户数据。
#
#   它做的事：
#     备份数据库 → 解压到临时目录 → 装依赖 → 建表/迁移 → 停服 → 换目录 → 起服
#     → 健康检查 → 失败自动回滚
#
set -euo pipefail

APP=/srv/blog
DATA=/srv/data
BACKUP=/srv/backup
SERVICE=blog
KEEP_PREV=3

TS=$(date +%Y%m%d-%H%M%S)
NEW="${APP}.new"
PREV="${APP}.prev"

log()  { printf '\033[36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '\033[32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m  !\033[0m %s\n' "$*"; }
die()  { printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

need_root() {
  [ "$(id -u)" -eq 0 ] || die "请用 sudo 运行"
}

# 健康检查：最多等 30 秒，应用自己回 200 才算成功
wait_healthy() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS -m 2 http://127.0.0.1:3000/health >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

db_backup() {
  local file="$BACKUP/db-${TS}-predeploy.sql.gz"
  mkdir -p "$BACKUP"

  # 从 .env 里读连接信息，避免脚本里硬编码密码
  local host user pass db
  host=$(grep -E '^DB_HOST=' "$APP/.env" | cut -d= -f2-)
  user=$(grep -E '^DB_USER=' "$APP/.env" | cut -d= -f2-)
  pass=$(grep -E '^DB_PASSWORD=' "$APP/.env" | cut -d= -f2-)
  db=$(grep -E '^DB_NAME=' "$APP/.env" | cut -d= -f2-)

  log "备份数据库 → $file"
  if command -v mysqldump >/dev/null 2>&1; then
    MYSQL_PWD="$pass" mysqldump -h"${host:-127.0.0.1}" -u"$user" \
      --single-transaction --quick --databases "$db" | gzip > "$file"
    ok "$(du -h "$file" | cut -f1)"
  else
    warn "找不到 mysqldump，跳过数据库备份（迁移前请自行确认）"
  fi
}

status() {
  log "服务状态"
  systemctl is-active "$SERVICE" >/dev/null 2>&1 && ok "systemd: running" || warn "systemd: 未运行"
  log "健康检查"
  if curl -fsS -m 3 http://127.0.0.1:3000/health; then echo; ok "应用正常"; else warn "应用无响应"; fi
  log "目录占用"
  du -sh "$APP" "$DATA" "$BACKUP" 2>/dev/null || true
  log "磁盘剩余"
  df -h / | tail -1
}

rollback() {
  need_root
  [ -d "$PREV" ] || die "没有可回滚的版本（$PREV 不存在）"

  log "回滚：$APP → $APP.failed.$TS，$PREV → $APP"
  systemctl stop "$SERVICE" || true
  mv "$APP" "$APP.failed.$TS"
  mv "$PREV" "$APP"
  systemctl start "$SERVICE"

  if wait_healthy; then
    ok "回滚完成，服务已恢复"
  else
    die "回滚后仍不健康，请查 journalctl -u $SERVICE -n 50"
  fi
}

deploy() {
  local pkg="$1"
  need_root
  [ -f "$pkg" ] || die "找不到包：$pkg"
  [ -f "$APP/.env" ] || die "$APP/.env 不存在，先按 .env.example 配置"

  # 1. 预检
  log "预检"
  df -h / | awk 'NR==2 {print "  根分区剩余 " $4}'
  command -v node >/dev/null || die "node 未安装"
  command -v npm  >/dev/null || die "npm 未安装"
  ok "node $(node -v)"

  # 2. 解压到临时目录
  log "解压新版本到 $NEW"
  rm -rf "$NEW"
  mkdir -p "$NEW"
  tar -xzf "$pkg" -C "$NEW"
  [ -f "$NEW/app.js" ] || die "包里没有 app.js，确认传的是项目根目录的打包"
  ok "文件数 $(find "$NEW" -type f | wc -l)"

  # 3. 配置文件跟着代码走，但内容永远是服务器上那份
  cp "$APP/.env" "$NEW/.env"
  chmod 600 "$NEW/.env"
  ok ".env 已复用"

  # 4. 装依赖
  log "安装依赖（npm ci --omit=dev）"
  ( cd "$NEW" && npm ci --omit=dev --no-audit --no-fund )
  ok "依赖安装完成"

  # 5. 迁移前备份
  db_backup

  # 6. 建表 / 迁移（脚本本身幂等，重复执行安全）
  log "执行迁移"
  ( cd "$NEW" && npm run migrate )
  ok "迁移完成"

  # 7. 换目录并重启
  log "切换版本并重启服务"
  systemctl stop "$SERVICE" || true
  rm -rf "${PREV}.old"
  if [ -d "$PREV" ]; then mv "$PREV" "${PREV}.old"; fi
  mv "$APP" "$PREV"
  mv "$NEW" "$APP"
  rm -rf "${PREV}.old"
  systemctl start "$SERVICE"

  # 8. 健康检查，失败自动回滚
  if wait_healthy; then
    ok "服务已启动，健康检查通过"
    log "清理旧版本（保留最近 $KEEP_PREV 个）"
    ls -1dt "${APP}".prev* "${APP}".failed.* 2>/dev/null | tail -n +$((KEEP_PREV + 1)) | xargs -r rm -rf
    ok "发布完成"
    echo
    echo "  回滚命令： sudo bash $0 --rollback"
    echo "  查看日志： journalctl -u $SERVICE -n 50 --no-pager"
  else
    warn "健康检查失败，开始自动回滚"
    systemctl stop "$SERVICE" || true
    mv "$APP" "$APP.failed.$TS"
    mv "$PREV" "$APP"
    systemctl start "$SERVICE"
    if wait_healthy; then
      ok "已回滚到上一版本，服务恢复"
      echo "  失败版本保留在 $APP.failed.$TS，用于排查"
      echo "  日志： journalctl -u $SERVICE -n 80 --no-pager"
    else
      die "回滚后仍不健康，人工介入：journalctl -u $SERVICE -n 80"
    fi
    exit 1
  fi
}

case "${1:-}" in
  --rollback) rollback ;;
  --status)   status ;;
  -h|--help|'') sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)          deploy "$1" ;;
esac
