#!/usr/bin/env bash
# Render a composition with a platform preset, sized to the machine it runs on.
#
#   scripts/render-preset.sh <composition-id> <preset> [--4k] [--hw] [--budget 50] [--background] [--out out/file.mp4] [extra remotion flags...]
#
# Presets: youtube-1080p | youtube-4k | shorts | reels | stories | facebook | feed | preview | prores
#
#   --4k        Capture at --scale=2: a 1080x1920 composition renders as 2160x3840, 1920x1080 as
#               3840x2160. Frame rate comes from the composition (60 fps in the templates). This is
#               the default master for every platform in this skill; omit it only for quick drafts.
#   --hw        Hardware encoding (VideoToolbox on macOS, NVENC on Linux/Windows with NVIDIA). Uses a
#               bitrate instead of CRF (the two cannot be combined). Faster and cooler on a fanless
#               laptop; files are larger. Good for long-form and drafts; software CRF is the best
#               quality-per-megabyte for short finals.
#   --budget N  Percent of the machine the render may use (default 50). Sets Chrome tab concurrency
#               = cores * N%, capped by memory (GB / 4); the whole render also runs under `nice -n 10`
#               so foreground apps stay responsive. 100 = take everything.
#   --background  macOS only: additionally run the render as a background task (taskpolicy -b), which
#               prefers efficiency cores. Slowest but invisible; use for overnight batches on battery.
#
# Extra flags pass straight to `npx remotion render` (e.g. --props='{"videoId":"launch"}' or --frames=0-90).
#
# Env overrides:
#   REMOTION_BUDGET=N        Same as --budget.
#   REMOTION_CONCURRENCY=n   Exact Chrome tab count, overrides the budget rule.
#   REMOTION_GL=angle|angle-egl|swangle   WebGL backend (default comes from remotion.config.ts).
#   REMOTION_HW=1            Same as --hw.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <composition-id> <preset> [--hw] [--out out/file.mp4] [extra flags]" >&2
  echo "Presets: youtube-1080p youtube-4k shorts reels stories facebook feed preview prores" >&2
  exit 1
fi

COMP="$1"; PRESET="$2"; shift 2
OUT=""
HW="${REMOTION_HW:-0}"
BUDGET="${REMOTION_BUDGET:-50}"
FOURK=0
BACKGROUND=0
EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --hw) HW=1; shift ;;
    --4k) FOURK=1; shift ;;
    --background) BACKGROUND=1; shift ;;
    --budget) BUDGET="$2"; shift 2 ;;
    --budget=*) BUDGET="${1#--budget=}"; shift ;;
    --out) OUT="$2"; shift 2 ;;
    --out=*) OUT="${1#--out=}"; shift ;;
    *) EXTRA+=("$1"); shift ;;
  esac
done
case "$BUDGET" in ''|*[!0-9]*) BUDGET=50 ;; esac
[ "$BUDGET" -lt 10 ] && BUDGET=10
[ "$BUDGET" -gt 100 ] && BUDGET=100

# ---- Hardware encoder availability ---------------------------------------------------------
# VideoToolbox exists on every Mac. On Linux/Windows Remotion uses NVENC, which needs an NVIDIA GPU;
# with `if-possible` FFmpeg still tries to open h264_nvenc and fails on machines without one, so guard it.
if [ "$HW" = "1" ]; then
  if [ "$(uname -s)" = "Darwin" ]; then
    :
  elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
    :
  else
    echo "  --hw requested but no VideoToolbox (macOS) or NVIDIA GPU found; using software x264 instead." >&2
    HW=0
  fi
fi

# ---- Machine profile ----------------------------------------------------------------------
if [ "$(uname -s)" = "Darwin" ]; then
  CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
  MEM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 8589934592) / 1073741824 ))
else
  CORES=$(nproc 2>/dev/null || echo 4)
  MEM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 8388608) / 1048576 ))
fi
BY_CPU=$(( CORES * BUDGET / 100 ))
BY_MEM=$(( MEM_GB / 4 ))
CONC_DEFAULT=$(( BY_CPU < BY_MEM ? BY_CPU : BY_MEM ))
[ "$CONC_DEFAULT" -lt 1 ] && CONC_DEFAULT=1
CONC="${REMOTION_CONCURRENCY:-$CONC_DEFAULT}"
export REMOTION_BUDGET="$BUDGET"

COMMON=(--codec=h264 --color-space=bt709 --pixel-format=yuv420p --audio-codec=aac --overwrite)
if [ -n "${REMOTION_GL:-}" ]; then COMMON+=("--gl=${REMOTION_GL}"); fi

# quality: software CRF + x264 preset, or hardware bitrate
quality() { # $1 crf  $2 x264 preset  $3 hw bitrate
  if [ "$HW" = "1" ]; then echo "--hardware-acceleration=if-possible --video-bitrate=$3"; else echo "--crf=$1 --x264-preset=$2"; fi
}

case "$PRESET" in
  youtube-1080p) FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 16 slow 16M) --audio-bitrate=320k); SUFFIX="youtube_1920x1080"; EXT=mp4 ;;
  youtube-4k)    FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 17 slow 60M) --audio-bitrate=320k --scale=2); SUFFIX="youtube_3840x2160"; EXT=mp4; CONC="${REMOTION_CONCURRENCY:-$(( CONC_DEFAULT / 2 > 0 ? CONC_DEFAULT / 2 : 1 ))}" ;;
  shorts)        FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 17 medium 14M) --audio-bitrate=256k); SUFFIX="shorts_1080x1920"; EXT=mp4 ;;
  reels)         FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 17 medium 14M) --audio-bitrate=256k); SUFFIX="reels_1080x1920"; EXT=mp4 ;;
  stories)       FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 17 medium 14M) --audio-bitrate=256k); SUFFIX="stories_1080x1920"; EXT=mp4 ;;
  facebook)      FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 17 medium 14M) --audio-bitrate=256k); SUFFIX="facebook_1080x1920"; EXT=mp4 ;;
  feed)          FLAGS=(${COMMON[@]+"${COMMON[@]}"} $(quality 17 medium 12M) --audio-bitrate=256k); SUFFIX="feed_1080x1350"; EXT=mp4 ;;
  preview)       FLAGS=(--codec=h264 --crf=28 --scale=0.5 --x264-preset=ultrafast --jpeg-quality=70 --overwrite); [ -n "${REMOTION_GL:-}" ] && FLAGS+=("--gl=${REMOTION_GL}"); SUFFIX="preview"; EXT=mp4 ;;
  prores)        FLAGS=(--codec=prores --prores-profile=4444 --image-format=png --pixel-format=yuva444p10le --overwrite); [ "$HW" = "1" ] && FLAGS+=(--hardware-acceleration=if-possible); [ -n "${REMOTION_GL:-}" ] && FLAGS+=("--gl=${REMOTION_GL}"); SUFFIX="prores"; EXT=mov ;;
  *) echo "Unknown preset: $PRESET" >&2; exit 1 ;;
esac
if [ "$FOURK" = "1" ] && [ "$PRESET" != "youtube-4k" ] && [ "$PRESET" != "preview" ]; then
  FLAGS+=(--scale=2)
  if [ "$HW" = "1" ]; then
    case "$PRESET" in shorts|reels|stories|facebook|feed) FLAGS=("${FLAGS[@]/--video-bitrate=14M/--video-bitrate=50M}"); FLAGS=("${FLAGS[@]/--video-bitrate=12M/--video-bitrate=50M}") ;; *) FLAGS=("${FLAGS[@]/--video-bitrate=16M/--video-bitrate=60M}") ;; esac
  fi
  SUFFIX="${SUFFIX}_4k"
  # Four times the pixels per tab: halve the tab count unless the user pinned one.
  [ -z "${REMOTION_CONCURRENCY:-}" ] && CONC=$(( CONC / 2 > 0 ? CONC / 2 : 1 ))
  # Software CRF at 4K is slow on a laptop; nudge the encoder preset one step faster.
  if [ "$HW" != "1" ]; then FLAGS=("${FLAGS[@]/--x264-preset=slow/--x264-preset=medium}"); fi
fi
FLAGS+=("--concurrency=${CONC}")
RUNNER=(nice -n 10)
if [ "$BACKGROUND" = "1" ] && [ "$(uname -s)" = "Darwin" ] && command -v taskpolicy >/dev/null 2>&1; then RUNNER=(taskpolicy -b nice -n 10); fi
# Tell remotion.config.ts to skip CRF in hardware mode (CRF and bitrate are mutually exclusive).
export REMOTION_HW="$HW"

if [ -z "$OUT" ]; then
  mkdir -p out
  OUT="out/${COMP}_${SUFFIX}.${EXT}"
fi

echo "Rendering $COMP with preset $PRESET -> $OUT"
echo "  machine: ${CORES} cores, ${MEM_GB} GB RAM | budget ${BUDGET}% -> concurrency ${CONC} | encoder: $([ "$HW" = "1" ] && echo hardware || echo 'software x264') | $([ "$FOURK" = "1" ] || [ "$PRESET" = "youtube-4k" ] && echo '4K master' || echo 'native size')"
${RUNNER[@]+"${RUNNER[@]}"} npx remotion render "$COMP" "$OUT" ${FLAGS[@]+"${FLAGS[@]}"} ${EXTRA[@]+"${EXTRA[@]}"}

if command -v ffprobe >/dev/null 2>&1; then
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,bit_rate -show_entries format=duration,size -of default=noprint_wrappers=1 "$OUT" || true
else
  npx remotion ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,bit_rate -show_entries format=duration,size -of default=noprint_wrappers=1 "$OUT" || true
fi
