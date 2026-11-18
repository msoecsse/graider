#!/bin/sh
# Guest-only synthetic-file experiment. Never execute on the host.
# Fixed filename, session, total size and chunk limit; no repository input.
set -efu
cd /work
session=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
total=131089
chunk=32768
if [ ! -e next ]; then printf '0 0\n' > next; : > large.bin; chmod 644 large.bin; fi
read -r expected_sequence expected_offset < next
read -r magic actual_session sequence kind offset length hash data extra < frame
[ "$magic" = GRT1 ] && [ "$actual_session" = "$session" ] && [ "$kind" = D ]
[ -z "$extra" ] && [ "$sequence" = "$expected_sequence" ] && [ "$offset" = "$expected_offset" ]
remaining=$((total - expected_offset))
if [ "$remaining" -gt "$chunk" ]; then expected_length=$chunk; else expected_length=$remaining; fi
[ "$expected_length" -gt 0 ] && [ "$length" = "$expected_length" ]
# Canonical reconstruction rejects spacing, line endings, trailing lines and aliases.
printf 'GRT1 %s %s D %s %s %s %s\n' "$session" "$sequence" "$offset" "$length" "$hash" "$data" > canonical
cmp frame canonical
printf '%s' "$data" | base64 -d > decoded
[ "$(stat -c %s decoded)" = "$length" ]
[ "$(base64 -w 0 decoded)" = "$data" ]
actual_hash=$(sha256sum decoded)
actual_hash=${actual_hash%% *}
[ "$actual_hash" = "$hash" ]
[ "$(stat -c %s large.bin)" = "$offset" ]
cat decoded >> large.bin
next_offset=$((expected_offset + expected_length))
printf '%s %s\n' "$((expected_sequence + 1))" "$next_offset" > next
rm decoded canonical
printf 'GRT1 %s %s ACK %s %s\n' "$session" "$sequence" "$next_offset" "$hash"
