#!/usr/bin/env bash
# Render a composition with a platform preset.
#
#   scripts/render-preset.sh <composition-id> <preset> [--out out/file.mp4] [extra remotion flags...]
#
# Presets: youtube-1080p | youtube-4k | shorts | reels | stories | facebook | feed | preview | prores
# Extra flags are passed straight to `npx remotion render` (e.g. --props='{"videoId":"launch"}').
# Env: REMOTION_GL=angle|angle-egl|swangle picks the WebGL backend (swangle for machines without a GPU).
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <composition-id> <preset> [--out out/file.mp4] [extra flags]" >&2
  echo "Presets: youtube-1080p youtube-4k shorts reels stories facebook feed preview prores" >&2
  exit 1
fi

COMP="$1"; PRESET="$2"; shift 2
OUT=""
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --out=*) OUT="${1#--out=}"; shift ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done

COMMON=(--codec=h264 --color-space=bt709 --pixel-format=yuv420p --audio-codec=aac --overwrite)
# GL backend: remotion.config.ts decides; set REMOTION_GL=swangle (no GPU / Docker) or angle-egl (Linux GPU) to override.
if [ -n "${REMOTION_GL:-}" ]; then COMMON+=("--gl=${REMOTION_GL}"); fi
case "$PRESET" in
  youtube-1080p) FLAGS=("${COMMON[@]}" --crf=16 --audio-bitrate=320k --x264-preset=slow); SUFFIX="youtube_1920x1080"; EXT=mp4 ;;
  youtube-4k)    FLAGS=("${COMMON[@]}" --crf=17 --audio-bitrate=320k --x264-preset=slow --scale=2); SUFFIX="youtube_3840x2160"; EXT=mp4 ;;
  shorts)        FLAGS=("${COMMON[@]}" --crf=17 --audio-bitrate=256k --x264-preset=medium); SUFFIX="shorts_1080x1920"; EXT=mp4 ;;
  reels)         FLAGS=("${COMMON[@]}" --crf=17 --audio-bitrate=256k --x264-preset=medium); SUFFIX="reels_1080x1920"; EXT=mp4 ;;
  stories)       FLAGS=("${COMMON[@]}" --crf=17 --audio-bitrate=256k --x264-preset=medium); SUFFIX="stories_1080x1920"; EXT=mp4 ;;
  facebook)      FLAGS=("${COMMON[@]}" --crf=17 --audio-bitrate=256k --x264-preset=medium); SUFFIX="facebook_1080x1920"; EXT=mp4 ;;
  feed)          FLAGS=("${COMMON[@]}" --crf=17 --audio-bitrate=256k --x264-preset=medium); SUFFIX="feed_1080x1350"; EXT=mp4 ;;
  preview)       FLAGS=(--codec=h264 --crf=28 --scale=0.5 --x264-preset=ultrafast --jpeg-quality=70 --overwrite); [ -n "${REMOTION_GL:-}" ] && FLAGS+=("--gl=${REMOTION_GL}"); SUFFIX="preview"; EXT=mp4 ;;
  prores)        FLAGS=(--codec=prores --prores-profile=4444 --image-format=png --pixel-format=yuva444p10le --overwrite); [ -n "${REMOTION_GL:-}" ] && FLAGS+=("--gl=${REMOTION_GL}"); SUFFIX="prores"; EXT=mov ;;
  *) echo "Unknown preset: $PRESET" >&2; exit 1 ;;
esac

if [ -z "$OUT" ]; then
  mkdir -p out
  OUT="out/${COMP}_${SUFFIX}.${EXT}"
fi

echo "Rendering $COMP with preset $PRESET -> $OUT"
npx remotion render "$COMP" "$OUT" "${FLAGS[@]}" "${EXTRA[@]}"

if command -v ffprobe >/dev/null 2>&1; then
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,bit_rate -show_entries format=duration -of default=noprint_wrappers=1 "$OUT" || true
else
  npx remotion ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,bit_rate -show_entries format=duration -of default=noprint_wrappers=1 "$OUT" || true
fi
