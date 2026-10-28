#!/bin/bash
# Headless Chrome shots of a built figure, one run per view:
#   ./shoot.sh 01-pencil.html pencil 'yaw=45' 'yaw=200&xr=1&labels=1' 'press=按一下@300'
# env: WIN=900,800  DSF=1  BUDGET=3000 (virtual ms)  DUMP=1 (also dump the DOM and print data-errors / NaN)
G="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DIR="$(cd "$(dirname "$0")" && pwd)"
f="$1"; name="$2"; shift 2
mkdir -p "$DIR/shots"
for v in "$@"; do
  tag=$(printf '%s' "$v" | LC_ALL=C tr -c 'a-zA-Z0-9.=' '_' | tr -s '_' | cut -c1-50)-$(printf '%s' "$v" | md5 | cut -c1-5)
  url="file://$DIR/$f?free=1&$v"
  ud="$(mktemp -d)"
  "$G" --headless=new --hide-scrollbars --user-data-dir="$ud" --force-device-scale-factor=${DSF:-1} \
    --window-size=${WIN:-900,800} --virtual-time-budget=${BUDGET:-3000} --screenshot="$DIR/shots/$name-$tag.png" "$url" >/dev/null 2>&1
  if [ -n "$DUMP" ]; then
    out=$("$G" --headless=new --user-data-dir="$(mktemp -d)" --window-size=${WIN:-900,800} --virtual-time-budget=${BUDGET:-3000} --dump-dom "$url" 2>/dev/null)
    err=$(printf '%s' "$out" | grep -o 'data-errors="[^"]*"' | head -1)
    nan=$(printf '%s' "$out" | grep -oE '[ "(,ML]NaN|NaN[ ,")LZ]' | wc -l | tr -d ' ')
    echo "$v -> ${err:-no errors} · NaN lines: $nan"
  fi
  rm -rf "$ud"
  echo "shots/$name-$tag.png"
done
