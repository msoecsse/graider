#!/bin/sh
# Guest PID 1 only. Never execute on the host.
set -eu
[ "$$" -eq 1 ] || exit 1
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
mount -t devtmpfs devtmpfs /dev
mount -t proc proc /proc
mount -t sysfs sysfs /sys
ip link set lo up
mkdir -p /work /run
mount -t tmpfs -o size=64m,nosuid,nodev tmpfs /work
mount -t tmpfs -o size=4m,nosuid,nodev tmpfs /run
chown 65534:65534 /work
chmod 700 /work
mkfifo /run/stdout /run/stderr
stty -F /dev/ttyAMA0 raw -echo
exec </dev/ttyAMA0 >/dev/ttyAMA0 2>/dev/null
printf 'GVM1 READY\n'
while IFS=' ' read -r operation request first second extra; do
  case "$request" in ''|*[!0-9]*) poweroff -f; exit 1 ;; esac
  [ -z "$extra" ] || exit 1
  case "$operation" in
    RUN)
      printf '%s' "$first" | base64 -d > /run/argv
      chmod 444 /run/argv
      # Fixed shell launcher; request argv is NUL-delimited data passed by xargs.
      # Bound captured output without applying a file limit to toolchain files.
      head -c 65537 </run/stdout >/run/out & outpid=$!
      head -c 65537 </run/stderr >/run/err & errpid=$!
      su -s /bin/sh nobody -c 'cd /work; exec /bin/busybox xargs -0 -x /bin/busybox env -i HOME=/work PATH=/opt/codex/bin:/usr/bin:/bin TMPDIR=/tmp /guest-command < /run/argv' 3>/run/status >/run/stdout 2>/run/stderr || :
      wait "$outpid" "$errpid"
      if [ "$(stat -c %s /run/out)" -gt 65536 ] || [ "$(stat -c %s /run/err)" -gt 65536 ]; then
        printf 'GVM1 %s ERROR\n' "$request"
        poweroff -f
        exit 1
      fi
      status=$(cat /run/status)
      case "$status" in ''|*[!0-9]*) printf 'GVM1 %s ERROR\n' "$request" ;;
        *)
          out=$(base64 -w 0 /run/out); err=$(base64 -w 0 /run/err)
          printf 'GVM1 %s EXIT %s %s %s\n' "$request" "$status" "${out:--}" "${err:--}"
          ;;
      esac
      ;;
    PUT|GET)
      printf '%s' "$first" | base64 -d > /run/path
      printf '%s' "$operation" > /run/operation
      if [ "${second:--}" = - ]; then : > /run/data
      else printf '%s' "$second" | base64 -d > /run/data; fi
      chmod 444 /run/path /run/data /run/operation
      if su -s /bin/sh nobody -c 'exec /guest-file' >/run/result 2>/dev/null; then
        printf 'GVM1 %s %s\n' "$request" "$(cat /run/result)"
      else printf 'GVM1 %s ERROR\n' "$request"; fi
      ;;
    *) exit 1 ;;
  esac
done
poweroff -f
