#!/bin/sh
# Invoked only by the guest transport with an argv array, as nobody.
"$@"
status=$?
printf '%s' "$status" >&3
