#!/usr/bin/env bash
# Create a Remotion project wired for the remotion-video-producer pipeline.
#
#   scripts/scaffold.sh <dir> [npm|pnpm|bun|yarn] [--keep-root]
#
# - Scaffolds with create-video (blank template) if <dir> has no package.json
# - Installs the packages the templates use, pinned to the project's Remotion version
# - Copies assets/templates into the project (src/, public/script, remotion.config.ts)
# - Replaces src/Root.tsx with the multi-platform example unless --keep-root is passed
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATES="$SKILL_DIR/assets/templates"
DIR="${1:-.}"
PM="${2:-npm}"
KEEP_ROOT=0
for arg in "$@"; do [ "$arg" = "--keep-root" ] && KEEP_ROOT=1; done

case "$PM" in
  npm)  INSTALL="npm install"; RUNX="npx" ;;
  pnpm) INSTALL="pnpm install"; RUNX="pnpm exec" ;;
  bun)  INSTALL="bun install"; RUNX="bunx" ;;
  yarn) INSTALL="yarn install"; RUNX="yarn" ;;
  *) echo "Unknown package manager: $PM" >&2; exit 1 ;;
esac

if [ ! -f "$DIR/package.json" ]; then
  if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null | grep -v -E '^(\.DS_Store|\.git|\.gitignore|README\.md|LICENSE|\.env)$' || true)" ]; then
    echo "Directory $DIR is not empty. Pick an empty or new directory, or run from inside an existing Remotion project." >&2
    exit 1
  fi
  echo "Scaffolding Remotion project in $DIR"
  npx create-video@latest --yes --blank --no-tailwind "$DIR"
fi

cd "$DIR"
echo "Installing dependencies with $PM"
$INSTALL

echo "Adding Remotion packages at the matching version"
$RUNX remotion add @remotion/media @remotion/transitions @remotion/google-fonts @remotion/captions @remotion/effects \
  @remotion/shapes @remotion/paths @remotion/noise @remotion/layout-utils @remotion/media-utils @remotion/sfx \
  @remotion/zod-types @remotion/motion-blur @remotion/fonts zod

echo "Copying templates"
mkdir -p src public/script public/voiceover public/music public/media public/captions out
cp -R "$TEMPLATES/src/." src/
cp "$TEMPLATES/remotion.config.ts" remotion.config.ts
[ -f public/script/example.json ] || cp "$TEMPLATES/public/script/example.json" public/script/example.json

if [ "$KEEP_ROOT" -eq 0 ]; then
  mv -f src/Root.example.tsx src/Root.tsx
  # The blank template's demo composition is no longer referenced.
  [ -f src/Composition.tsx ] && grep -q "MyComposition" src/Composition.tsx && rm -f src/Composition.tsx
else
  echo "Kept existing src/Root.tsx; see src/Root.example.tsx for how to register the platform compositions."
fi

# Keep secrets and large generated files out of git.
touch .gitignore
for line in ".env" "out/" "whisper.cpp/" "public/voiceover/**/*.16k.wav"; do
  grep -qxF "$line" .gitignore || echo "$line" >> .gitignore
done
[ -f .env ] || printf '# ELEVENLABS_API_KEY=\n# OPENAI_API_KEY=\n' > .env

echo
echo "Type check:"
$RUNX tsc --noEmit && echo "  ok"
echo
echo "Compositions:"
$RUNX remotion compositions 2>/dev/null | tail -n +1 || true
echo
echo "Next:"
echo "  1. Edit public/script/<videoId>.json (start from example.json)"
echo "  2. node $SKILL_DIR/scripts/generate-voiceover.mjs --script public/script/<videoId>.json"
echo "  3. $RUNX remotion studio --no-open"
