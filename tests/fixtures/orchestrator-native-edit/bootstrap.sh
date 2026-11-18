#!/bin/sh
# Guest PID 1 only: never run this script on the host.
# Bubblewrap cannot pivot_root away from Linux's initial rootfs.
set -eu
[ "$$" -eq 1 ] || { printf 'Guest PID 1 required\n' >&2; exit 1; }
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
mkdir /newroot
mount -t tmpfs -o size=1024m,nosuid,nodev tmpfs /newroot
for entry in /*; do
  case "$entry" in
    /newroot|/dev|/proc|/sys) ;;
    *) cp -a "$entry" /newroot/ ;;
  esac
done
mkdir -p /newroot/dev /newroot/proc /newroot/sys
exec switch_root /newroot /guest-init
