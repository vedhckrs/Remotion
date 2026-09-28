#!/usr/bin/env bash
# Print the machine profile Remotion will run on and the settings this skill recommends for it.
#
#   scripts/machine-check.sh [--render-test <composition-id> [extra remotion flags]]
#
# With --render-test, renders one still through the recommended GL backend and times it, then
# renders one with WebGL extras enabled to confirm effects work. Run from inside a Remotion project.
# Extra flags go to `npx remotion still` (e.g. --ignore-certificate-errors behind a corporate proxy).
set -uo pipefail

OS="$(uname -s)"
ARCH="$(uname -m)"
if [ "$OS" = "Darwin" ]; then
  CHIP=$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo "Apple Silicon")
  CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
  PERF_CORES=$(sysctl -n hw.perflevel0.physicalcpu 2>/dev/null || echo "?")
  MEM_GB=$(( $(sysctl -n hw.memsize 2>/dev/null || echo 8589934592) / 1073741824 ))
  GPU_CORES=$(system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Total Number of Cores/ {print $2; exit}')
  GL="angle"
else
  CHIP=$(awk -F': ' '/model name/ {print $2; exit}' /proc/cpuinfo 2>/dev/null || echo "?")
  CORES=$(nproc 2>/dev/null || echo 4)
  PERF_CORES="?"
  MEM_GB=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 8388608) / 1048576 ))
  GPU_CORES="?"
  if [ -e /dev/dri/renderD128 ]; then GL="angle-egl"; else GL="swangle"; fi
fi
[ -n "${REMOTION_GL:-}" ] && GL="$REMOTION_GL"

CONC=$(( CORES / 2 < MEM_GB / 4 ? CORES / 2 : MEM_GB / 4 )); [ "$CONC" -lt 1 ] && CONC=1
CONC_4K=$(( CONC / 2 )); [ "$CONC_4K" -lt 1 ] && CONC_4K=1
FREE_GB=$(df -Pk . | awk 'NR==2 {printf "%d", $4/1048576}')

echo "Machine"
echo "  OS/arch:        $OS $ARCH"
echo "  Chip:           $CHIP"
echo "  CPU cores:      $CORES (performance cores: $PERF_CORES)"
echo "  GPU cores:      ${GPU_CORES:-?}"
echo "  Memory:         ${MEM_GB} GB"
echo "  Free disk here: ${FREE_GB} GB"
echo "  Node:           $(node --version 2>/dev/null || echo missing)   npm: $(npm --version 2>/dev/null || echo missing)"
echo "  cmake:          $(command -v cmake >/dev/null 2>&1 && cmake --version | head -1 || echo 'missing (needed only for whisper.cpp >= 1.7.3)')"
WHISPER_DIR="${WHISPER_DIR:-$HOME/.cache/remotion-whisper}"
if [ -d "$WHISPER_DIR" ]; then echo "  Whisper cache:  $WHISPER_DIR ($(du -sh "$WHISPER_DIR" 2>/dev/null | cut -f1))"; else echo "  Whisper cache:  none yet ($WHISPER_DIR)"; fi
if [ -d node_modules/.remotion ]; then echo "  Headless Chrome: installed in node_modules/.remotion ($(du -sh node_modules/.remotion 2>/dev/null | cut -f1))"; fi
echo
echo "Recommended settings"
echo "  WebGL backend:        --gl=$GL   (export REMOTION_GL=$GL)"
echo "  Concurrency 1080p:    $CONC      (export REMOTION_CONCURRENCY=$CONC)"
echo "  Concurrency 4K/WebGL: $CONC_4K"
if [ "$OS" = "Darwin" ]; then
  echo "  Hardware encoder:     VideoToolbox available: use scripts/render-preset.sh <id> <preset> --hw for long-form and drafts"
fi
if [ "$MEM_GB" -le 16 ]; then
  echo "  Memory:               close Remotion Studio and browser tabs during final renders; add --disallow-parallel-encoding if the machine swaps"
fi
if [ "$FREE_GB" -lt 30 ]; then
  echo "  Disk:                 under 30 GB free. Clear out/ and node_modules/.cache, and keep one Whisper model."
fi
if [ "$OS" = "Darwin" ] && [ "$MEM_GB" -le 16 ]; then
  echo "  Thermals:             fanless laptops throttle after ~10 min of full load; plug in, keep the lid open, prefer --hw or x264 'medium' for renders over 3 minutes"
fi

if [ "${1:-}" = "--render-test" ] && [ -n "${2:-}" ]; then
  COMP="$2"; shift 2
  EXTRA=("$@")
  mkdir -p out
  echo
  echo "Render test: one still of $COMP with --gl=$GL"
  START=$(date +%s)
  if npx remotion still "$COMP" out/machine-check.png --frame=10 --gl="$GL" --log=error ${EXTRA[@]+"${EXTRA[@]}"}; then
    echo "  ok in $(( $(date +%s) - START )) s -> out/machine-check.png"
  else
    if [ "$GL" = "swangle" ]; then
      echo "  FAILED on swangle, so the GL backend is not the cause. Check the error above: a font or asset fetch (behind a proxy add --ignore-certificate-errors), a missing script JSON, or a code error." >&2
    else
      echo "  FAILED. Try the software backend: REMOTION_GL=swangle $0 --render-test $COMP" >&2
    fi
    exit 1
  fi
  echo "Render test: WebGL extras (light leak, grain) with --gl=$GL"
  START=$(date +%s)
  if npx remotion still "$COMP" out/machine-check-webgl.png --frame=20 --gl="$GL" --props='{"webglExtras":true}' --log=error ${EXTRA[@]+"${EXTRA[@]}"}; then
    echo "  ok in $(( $(date +%s) - START )) s -> out/machine-check-webgl.png"
  else
    echo "  WebGL FAILED on $GL. Effects, light leaks and shader transitions need a working backend; try swangle." >&2
    exit 1
  fi
fi
