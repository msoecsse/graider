#!/bin/sh
# Guest-only bounded byte transfer. Returned bytes are always untrusted.
set -efu
cd /work
target=$(cat /run/path)
case "$target" in ''|/*|*[!a-zA-Z0-9_./\(\)-]*) exit 1 ;; esac
operation=$(cat /run/operation)
oldifs=$IFS
IFS=/
set -- $target
IFS=$oldifs
directory=.
for part do
  case "$part" in ''|.|..|.[gG][iI][tT]|.[cC][oO][dD][eE][xX]|.[sS][sS][hH]|.[aA][wW][sS]) exit 1 ;; esac
  directory=$directory/$part
  [ ! -L "$directory" ] || exit 1
  if [ "$directory" != "./$target" ]; then
    [ -d "$directory" ] || mkdir "$directory"
  fi
done
if [ -e "$target" ]; then
  [ -f "$target" ] && [ "$(stat -c %h "$target")" -eq 1 ] || exit 1
fi
if [ "$operation" = PUT ]; then
  [ "$(stat -c %s /run/data)" -le 65536 ] || exit 1
  cat /run/data > "$target"
  printf OK
else
  [ -f "$target" ] && [ "$(stat -c %s "$target")" -le 65536 ] || exit 1
  data=$(base64 -w 0 "$target")
  printf 'DATA %s' "${data:--}"
fi
