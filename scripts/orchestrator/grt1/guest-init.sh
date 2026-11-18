#!/bin/sh
# Fixed guest PID 1 only, never invoked on the host. No GVM1 or command endpoint.
set -eu
[ "$$" -eq 1 ] || exit 1
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
mount -t devtmpfs devtmpfs /dev
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mkdir -p /work
mount -t tmpfs -o size=64m,nr_inodes=4096,nosuid,nodev,noexec tmpfs /work
chown 65534:65534 /work
chmod 700 /work
stty -F /dev/ttyAMA0 raw -echo
exec </dev/ttyAMA0 >/dev/ttyAMA0 2>/dev/null
# Fixed command in the immutable image. No imported command or argument is used.
su -s /bin/sh nobody -c 'cd /work; exec /usr/bin/env -i HOME=/nonexistent PATH=/usr/bin:/bin /usr/bin/python3 -I -S -B /grt1/guest.py' || :
poweroff -f
