#!/usr/bin/env bash
# Run the dashboard in the background on this Mac: starts at login, restarts if it stops, no Terminal
# window needed. Open http://localhost:<port> (or the Chrome app you install from that page).
#
#   bash scripts/install-dashboard.sh [--port 4545] [--full-speed] [--uninstall]
#
# --full-speed runs renders at normal priority (Nice 0, ProcessType Interactive) instead of the default
# low priority (Nice 10), so a render takes all the CPU it can even while you use other apps. The default
# keeps the Mac responsive; either way an idle Mac gives the render every core.
#
# Run from the project root. Creates ~/Library/LaunchAgents/com.remotion.dashboard.plist, which runs
# `node tools/dashboard/server.mjs` at nice 10 with the project as working directory (so .env is read as
# usual). Log: tools/dashboard/dashboard.log. Stop for now: launchctl bootout gui/$(id -u)/com.remotion.dashboard
# (it comes back at the next login); remove for good: --uninstall.
set -euo pipefail

PROJECT="$(pwd)"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=4545
UNINSTALL=0
NICE=10
PTYPE=Standard
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --port=*) PORT="${1#--port=}"; shift ;;
    --full-speed) NICE=0; PTYPE=Interactive; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "Unknown option $1" >&2; exit 1 ;;
  esac
done

PROJECT_KEY="$(printf '%s' "$PROJECT" | shasum -a 256 | cut -c 1-12)"
LABEL="com.remotion.dashboard.$PROJECT_KEY"
if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer uses launchd (macOS). On Linux, a systemd user service works the same way:"
  echo "  ExecStart=$(command -v node || echo node) $PROJECT/tools/dashboard/server.mjs --skill $SKILL_DIR --port $PORT"
  echo "  WorkingDirectory=$PROJECT"
  exit 0
fi

UID_NUM="$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ "$UNINSTALL" -eq 1 ]; then
  launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed the background dashboard. Start it by hand with: npm run dashboard"
  exit 0
fi

if [ ! -f "$PROJECT/tools/dashboard/server.mjs" ]; then
  echo "tools/dashboard/server.mjs not found. Run this from your Remotion project (the folder with package.json)," >&2
  echo "or install the dashboard first: bash \"$SKILL_DIR/scripts/scaffold.sh\" . --update" >&2
  exit 1
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "node is not on PATH. Install Node.js (brew install node) and run this again." >&2
  exit 1
fi

# A dashboard started by hand in a Terminal holds the port; the background one could not start.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && ! launchctl print "gui/$UID_NUM/$LABEL" >/dev/null 2>&1; then
  echo "Something is already listening on port $PORT (probably the dashboard in a Terminal window)." >&2
  echo "Stop it first (click that window, press Ctrl+C), then run this again." >&2
  exit 1
fi

# launchd starts with a minimal PATH: add node's folder, Homebrew, and where claude usually lives.
JOB_PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$HOME/.claude/local"
# The same claude your Terminal runs (an alias in ~/.zshrc is followed), so the script writer uses your login.
. "$SKILL_DIR/scripts/lib/resolve-claude.sh"
CLAUDE_BIN="$(resolve_claude)"
[ -n "$CLAUDE_BIN" ] && JOB_PATH="$(dirname "$CLAUDE_BIN"):$JOB_PATH"

mkdir -p "$HOME/Library/LaunchAgents"
LOG="$PROJECT/tools/dashboard/dashboard.log"
xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$(xml "$NODE")</string>
    <string>$(xml "$PROJECT/tools/dashboard/server.mjs")</string>
    <string>--skill</string><string>$(xml "$SKILL_DIR")</string>
    <string>--port</string><string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$PROJECT")</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$(xml "$JOB_PATH")</string>
    <key>HOME</key><string>$(xml "$HOME")</string>
    <key>CLAUDE_BIN</key><string>$(xml "${CLAUDE_BIN:-claude}")</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>Nice</key><integer>$NICE</integer>
  <key>ProcessType</key><string>$PTYPE</string>
  <key>StandardOutPath</key><string>$(xml "$LOG")</string>
  <key>StandardErrorPath</key><string>$(xml "$LOG")</string>
</dict></plist>
EOF

launchctl bootout "gui/$UID_NUM" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

# Wait for it to answer so the message below is true.
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/plan"; then
    echo "Dashboard is running in the background: http://localhost:$PORT ($([ "$NICE" -eq 0 ] && echo "full-speed priority" || echo "low priority; add --full-speed for maximum speed"))"
    echo "  starts at every login, restarts if it stops; no Terminal window needed"
    if [ -n "$CLAUDE_BIN" ]; then echo "  script writer: $CLAUDE_BIN"; else echo "  script writer: claude not found (install Claude Code, or add script-*.md files to episode folders)"; fi
    echo "  log:     $LOG"
    echo "  restart: launchctl kickstart -k gui/$UID_NUM/$LABEL"
    echo "  remove:  bash \"$SKILL_DIR/scripts/install-dashboard.sh\" --uninstall"
    echo
    echo "Tip: in Chrome open http://localhost:$PORT, then menu > Cast, save and share > Install page as app"
    echo "     for a Dock icon that opens the dashboard in its own window."
    echo "First time you save to an external drive or use Choose..., macOS may ask to allow node access: click Allow."
    exit 0
  fi
  sleep 1
done
echo "Installed, but the dashboard did not answer on port $PORT yet. Check the log: $LOG" >&2
exit 1
