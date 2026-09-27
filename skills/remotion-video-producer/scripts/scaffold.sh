#!/usr/bin/env bash
# Create a Remotion project wired for the remotion-video-producer pipeline.
#
#   scripts/scaffold.sh <dir> [npm|pnpm|bun|yarn] [--keep-root] [--update]
#
# --update refreshes an existing project to this skill version: backs up src/ and tools/dashboard to
# .skill-backup/<time>/, copies the new templates and dashboard, keeps src/Root.tsx, the project's own
# src/lib/brand-styles.ts, public/, automation/ and .env untouched.
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
case "$PM" in --*) PM=npm ;; esac
KEEP_ROOT=0
UPDATE=0
for arg in "$@"; do
  [ "$arg" = "--keep-root" ] && KEEP_ROOT=1
  [ "$arg" = "--update" ] && UPDATE=1 && KEEP_ROOT=1
done

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
  @remotion/zod-types @remotion/motion-blur @remotion/fonts @remotion/install-whisper-cpp zod

echo "Adding icon and logo sources (simple-icons: 3000+ brand marks with official colors)"
$INSTALL simple-icons >/dev/null 2>&1 || npm install simple-icons >/dev/null 2>&1 || echo "  simple-icons install skipped (fetch-icons.mjs falls back to jsDelivr)"

if [ "$UPDATE" -eq 1 ]; then
  BACKUP=".skill-backup/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  [ -d src ] && cp -R src "$BACKUP/src"
  [ -d tools/dashboard ] && cp -R tools/dashboard "$BACKUP/dashboard"
  echo "Update mode: backed up src/ and tools/dashboard/ to $BACKUP"
fi

echo "Copying templates"
mkdir -p src public/script public/voiceover public/music public/media public/captions public/icons out automation
# The project's own presets live in src/lib/brand-styles.ts and are never overwritten.
BRAND_KEEP=""
if [ -f src/lib/brand-styles.ts ]; then BRAND_KEEP="$(mktemp)"; cp src/lib/brand-styles.ts "$BRAND_KEEP"; fi
cp -R "$TEMPLATES/src/." src/
if [ -n "$BRAND_KEEP" ]; then cp "$BRAND_KEEP" src/lib/brand-styles.ts; rm -f "$BRAND_KEEP"; fi
if [ "$UPDATE" -eq 1 ] && [ -f "$BACKUP/src/lib/styles.ts" ]; then
  # Presets added straight into the old styles.ts would be lost; name them so they can move to brand-styles.ts.
  MISSING="$(grep -o "id: '[a-z0-9-]*'" "$BACKUP/src/lib/styles.ts" | sort -u | while read -r l; do grep -qF "$l" src/lib/styles.ts src/lib/brand-styles.ts || echo "$l"; done)"
  if [ -n "$MISSING" ]; then
    echo "  Custom presets found in your old src/lib/styles.ts:"
    echo "$MISSING" | sed 's/^/    /'
    echo "  Move them into src/lib/brand-styles.ts (copy from $BACKUP/src/lib/styles.ts) so they survive updates."
  fi
fi
cp "$TEMPLATES/remotion.config.ts" remotion.config.ts

# create-video installs Tailwind v4 in the blank template (src/index.css imports it).
# Keep it wired in the config so the CSS is processed; templates themselves use inline styles.
if grep -q '"@remotion/tailwind-v4"' package.json && ! grep -q enableTailwind remotion.config.ts; then
  node -e '
const fs = require("fs");
let c = fs.readFileSync("remotion.config.ts", "utf8");
c = c.replace("import {Config} from '\''@remotion/cli/config'\'';", "import {Config} from '\''@remotion/cli/config'\'';\nimport {enableTailwind} from '\''@remotion/tailwind-v4'\'';");
c += "\n// Tailwind v4 was installed by create-video. Animate with useCurrentFrame(), never with transition-* or animate-* classes.\nConfig.overrideBundlerConfig(enableTailwind);\n";
fs.writeFileSync("remotion.config.ts", c);
'
  echo "Tailwind v4 detected: kept enabled in remotion.config.ts"
fi
[ -f public/script/example.json ] || cp "$TEMPLATES/public/script/example.json" public/script/example.json

echo "Installing the local dashboard (tools/dashboard) and LUTs (public/luts)"
mkdir -p tools/dashboard public/luts
SETTINGS_KEEP=""
if [ -f tools/dashboard/settings.json ]; then SETTINGS_KEEP="$(mktemp)"; cp tools/dashboard/settings.json "$SETTINGS_KEEP"; fi
cp -R "$SKILL_DIR/assets/dashboard/." tools/dashboard/
if [ -n "$SETTINGS_KEEP" ]; then cp "$SETTINGS_KEEP" tools/dashboard/settings.json; rm -f "$SETTINGS_KEEP"; fi
node "$SKILL_DIR/scripts/make-lut.mjs" --out public/luts >/dev/null && echo "  7 LUTs written"

echo "Automation files (automation/): queue.json, topics.md, writer-prompt.md"
[ -f automation/queue.json ] || cp "$SKILL_DIR/assets/automation/queue.example.json" automation/queue.json
[ -f automation/topics.md ] || cp "$SKILL_DIR/assets/automation/topics.example.md" automation/topics.md
[ -f automation/writer-prompt.md ] || cp "$SKILL_DIR/assets/automation/writer-prompt.md" automation/writer-prompt.md

echo "Example icons for the sample script"
node "$SKILL_DIR/scripts/fetch-icons.mjs" --from-script public/script/example.json >/dev/null 2>&1 && echo "  public/icons ready" || echo "  icon fetch skipped (offline?); run: npm run icons -- --from-script public/script/example.json"

# npm scripts that point at the skill's scripts (absolute path, so the project stays thin).
node -e '
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const skill = process.argv[1];
pkg.scripts = Object.assign({}, pkg.scripts, {
  dashboard: `nice -n 10 node tools/dashboard/server.mjs --skill "${skill}"`,
  "machine-check": `bash "${skill}/scripts/machine-check.sh" --render-test Shorts`,
  analyze: `node "${skill}/scripts/analyze-script.mjs"`,
  voice: `node "${skill}/scripts/generate-voiceover.mjs"`,
  captions: `node "${skill}/scripts/transcribe-whisper.mjs"`,
  music: `node "${skill}/scripts/generate-music.mjs"`,
  luts: `node "${skill}/scripts/make-lut.mjs"`,
  render: `bash "${skill}/scripts/render-preset.sh"`,
  icons: `node "${skill}/scripts/fetch-icons.mjs"`,
  thumbs: `node "${skill}/scripts/make-thumbnails.mjs"`,
  pack: `node "${skill}/scripts/make-publish-pack.mjs"`,
  publish: `node "${skill}/scripts/publish.mjs"`,
  "auth-youtube": `node "${skill}/scripts/auth-youtube.mjs"`,
  autopilot: `node "${skill}/scripts/autopilot.mjs"`,
  "autopilot:install": `bash "${skill}/scripts/install-autopilot.sh"`,
  "dashboard:install": `bash "${skill}/scripts/install-dashboard.sh"`,
  check: `node "${skill}/scripts/analyze-script.mjs" --check`,
});
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$SKILL_DIR"
echo "  npm scripts added: dashboard, dashboard:install, machine-check, analyze, check, voice, captions, music, luts, render, icons, thumbs, pack, publish, auth-youtube, autopilot, autopilot:install"

if [ "$KEEP_ROOT" -eq 0 ]; then
  mv -f src/Root.example.tsx src/Root.tsx
  # The blank template's demo composition is no longer referenced.
  [ -f src/Composition.tsx ] && grep -q "MyComposition" src/Composition.tsx && rm -f src/Composition.tsx
else
  echo "Kept existing src/Root.tsx; see src/Root.example.tsx for how to register the platform compositions."
fi

# Keep secrets and large generated files out of git.
touch .gitignore
for line in ".env" "out/" ".skill-backup/" "whisper.cpp/" "public/voiceover/**/*.16k.wav" "automation/logs/" "automation/.lock"; do
  grep -qxF "$line" .gitignore || echo "$line" >> .gitignore
done
[ -f .env ] || printf '# ELEVENLABS_API_KEY=\n# OPENAI_API_KEY=\n# YouTube (scripts/auth-youtube.mjs): YT_CLIENT_ID= YT_CLIENT_SECRET= YT_REFRESH_TOKEN=\n# Meta: IG_USER_ID= META_ACCESS_TOKEN= META_PAGE_ID= META_PAGE_TOKEN=\n' > .env

echo
echo "Type check:"
$RUNX tsc --noEmit && echo "  ok"
echo
echo "Compositions:"
$RUNX remotion compositions 2>/dev/null | tail -n +1 || true
echo
echo "Next:"
echo "  0. npm run machine-check                       # confirm GL backend and concurrency on this machine"
echo "  1. npm run dashboard                           # local control room at http://localhost:4545"
echo "  2. npm run analyze -- script.md --id <videoId> # or edit public/script/<videoId>.json by hand"
echo "  3. npm run voice -- --script public/script/<videoId>.json"
echo "  4. npm run render -- Shorts shorts --4k        # 4K60 master, 50% machine budget"
echo "  5. npm run thumbs -- --video <videoId> && npm run pack -- --video <videoId>   # thumbnails + per-platform upload copy"
echo "  6. npm run autopilot -- plan && npm run autopilot -- run                       # or npm run autopilot:install for the nightly job"
