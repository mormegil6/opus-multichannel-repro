#!/usr/bin/env bash
# Regenerate the 1-channel clip embedded in index.html's CLIPS array. The
# 2-channel and 16-channel clips predate this script and have no recorded
# recipe; this one exists so the mono clip added 2026-09-14 does.
#
# 48 kHz to match the other two clips. Mapping family 0 (the libopus
# default for one channel) rather than 255, since family 255 exists to
# carry independent streams and a single channel has nothing to map.
set -e
cd "$(dirname "$0")"

ffmpeg -y -v error -f lavfi -i "aevalsrc=exprs='0.5*sin(2*PI*440*t)':c=mono:s=48000:d=1.008" \
  -c:a libopus -b:a 32k -fflags +bitexact -flags +bitexact -f webm mono.webm

echo "wrote mono.webm ($(wc -c < mono.webm) bytes). Base64, paste into index.html:"
base64 -i mono.webm | tr -d '\n'
echo
