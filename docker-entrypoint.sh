#!/bin/sh
# 容器启动入口：确保数据目录存在并且网站进程有权限写入，然后以普通用户 node 的身份运行。
set -e

mkdir -p "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  # su 会直接切换身份并替换当前进程，网站进程能正常收到停止信号。
  # 「--」之后依次是：用户名、要运行的程序、程序的参数。
  exec su -s /bin/sh -c 'exec "$0" "$@"' -- node "$@"
fi
exec "$@"
