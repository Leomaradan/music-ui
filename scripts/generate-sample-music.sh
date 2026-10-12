#!/usr/bin/env sh
# Generates a small tagged sample library (sine tones) in two music folders,
# used by the dev Navidrome (docker/compose.dev.yml) and integration tests.
# Usage: scripts/generate-sample-music.sh [target-dir]   (default: ./docker/music)
set -eu

TARGET="${1:-./docker/music}"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }

# Albums with embedded cover art (a plain colored square), to exercise cover art.
COVERS_DIR="$(mktemp -d)"
trap 'rm -rf "$COVERS_DIR"' EXIT
cover_for() {
  case "$1" in
    'Pump') echo 'c0392b' ;;
    'Arrival') echo '2980b9' ;;
    *) echo '' ;;
  esac
}

# folder|album artist|album|year|genre|track artist|title
TRACKS='
main|Aerosmith|Toys in the Attic|1975|Rock|Aerosmith|Walk This Way
main|Aerosmith|Toys in the Attic|1975|Rock|Aerosmith|Sweet Emotion
main|Aerosmith|Pump|1989|Rock|Aerosmith|Love in an Elevator
main|ABBA|Arrival|1976|Pop|ABBA|Dancing Queen
main|ABBA|Arrival|1976|Pop|ABBA|Knowing Me, Knowing You
main|Various Artists|Summer Hits|2001|Pop;Dance|Artist One|Sunny Day
main|Various Artists|Summer Hits|2001|Pop;Dance|Artist Two feat. Artist One|Beach Night
live|Aerosmith|Live! Bootleg|1978|Rock|Aerosmith|Back in the Saddle (Live)
live|Miles Davis|Live at the Plugged Nickel|1965|Jazz|Miles Davis|So What (Live)
live|Miles Davis|Live at the Plugged Nickel|1965|Jazz|Miles Davis|Stella by Starlight (Live)
'

echo "$TRACKS" | awk 'NF' | awk -F'|' '{ key=$1"|"$3; n[key]++; print n[key] "|" $0 }' |
while IFS='|' read -r num folder albumartist album year genre artist title; do
  dir="$TARGET/$folder/$albumartist/$album"
  mkdir -p "$dir"
  file="$dir/$(printf '%02d' "$num") - $(echo "$title" | tr '/' '-').mp3"
  [ -f "$file" ] && continue
  freq=$((220 + num * 55))
  color=$(cover_for "$album")
  if [ -n "$color" ]; then
    cover="$COVERS_DIR/$color.png"
    [ -f "$cover" ] || ffmpeg -nostdin -loglevel error -f lavfi -i "color=c=0x$color:s=600x600" \
      -frames:v 1 "$cover"
    set -- -i "$cover" -map 0:a -map 1:v -c:v png -disposition:v attached_pic
  else
    set --
  fi
  ffmpeg -nostdin -loglevel error -f lavfi -i "sine=frequency=$freq:duration=8" "$@" -ac 2 -b:a 128k \
    -id3v2_version 3 \
    -metadata title="$title" -metadata artist="$artist" -metadata album_artist="$albumartist" \
    -metadata album="$album" -metadata date="$year" -metadata genre="$genre" \
    -metadata track="$num" "$file"
done

echo "Sample library ready in $TARGET"
