#!/usr/bin/env bash
#
# Blog_j 日常巡检：五项检查，全部正常才返回 0，便于挂到 cron 或告警里。
#
#   用法：
#     sudo bash ops-check.sh          # 推荐用 sudo，日志才看得全
#     bash ops-check.sh               # 普通用户也能跑，日志部分会跳过
#
set -uo pipefail

APP=blog
PORT=3000
BACKUP_DIR=/srv/backup
DISK_WARN=80
BACKUP_MAX_AGE_H=26

fail=0
line() { printf '%s\n' "$*"; }

# ---------- 1. 服务 ----------
line "== 服务 =="
for svc in blog nginx mysql; do
  status=$(systemctl is-active "$svc" 2>/dev/null || echo unknown)
  printf '  %-6s %s\n' "$svc" "$status"
  [ "$status" = "active" ] || fail=1
done

# ---------- 2. 健康检查 ----------
line "== 健康 =="
health=$(curl -s -m 3 "http://127.0.0.1:${PORT}/health" || true)
if [ -z "$health" ]; then
  line "  无响应（应用可能没起来）"
  fail=1
else
  line "  $health"
  case "$health" in
    *'"status":"up"'*) ;;
    *) line "  状态不是 up，看 journalctl -u ${APP} -n 50"; fail=1 ;;
  esac
fi

# ---------- 3. 今日错误日志 ----------
line "== 今日错误 =="
if id -nG 2>/dev/null | tr ' ' '\n' | grep -qx 'systemd-journal'; then
  errs=$(journalctl -u "$APP" -p err --since today --no-pager -q 2>/dev/null | tail -5)
  if [ -n "$errs" ]; then line "$errs"; else line "  无"; fi
else
  line "  跳过：当前用户不在 systemd-journal 组"
  line "  修法：sudo usermod -aG systemd-journal \$USER  然后重新登录"
fi

# ---------- 4. 磁盘 ----------
line "== 磁盘 =="
use=$(df / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
avail=$(df -h / | awk 'NR==2 {print $4}')
line "  / 已用 ${use}%，剩余 ${avail}"
[ "$use" -lt "$DISK_WARN" ] || { line "  超过 ${DISK_WARN}%，该清理了"; fail=1; }

# ---------- 5. 备份 ----------
line "== 备份 =="
newest=$(ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | head -1)
if [ -z "$newest" ]; then
  line "  ${BACKUP_DIR} 下没有 db-*.sql.gz"
  line "  可能原因：没跑过备份 / BACKUP_DIR 没配 / 备份跑到了别处"
  fail=1
else
  size=$(stat -c %s "$newest")
  age_h=$(( ( $(date +%s) - $(stat -c %Y "$newest") ) / 3600 ))
  line "  $(basename "$newest")  $(numfmt --to=iec "$size")  距今 ${age_h}h"

  # 0 字节的备份比没有备份更危险：它看起来是成功的
  if [ "$size" -lt 1024 ]; then
    line "  文件小于 1KB，几乎肯定是失败的备份"
    fail=1
  fi
  if [ "$age_h" -gt "$BACKUP_MAX_AGE_H" ]; then
    line "  超过 ${BACKUP_MAX_AGE_H} 小时没更新，定时任务可能没跑"
    fail=1
  fi
fi

line ""
if [ "$fail" -eq 0 ]; then
  line "结论：全部正常"
else
  line "结论：有异常，见上面标红项"
fi
exit "$fail"
