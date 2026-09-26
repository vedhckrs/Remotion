#!/usr/bin/env bash
# Install (or remove) the launchd agents that run autopilot on this Mac.
#
#   bash scripts/install-autopilot.sh [--hour 1] [--minute 30] [--publish-every 30] [--uninstall]
#
# Creates two agents in ~/Library/LaunchAgents:
#   com.remotion.autopilot.produce   nightly at --hour:--minute (default 01:30): plan tomorrow, then produce
#                                    and schedule the 3 videos, under caffeinate so the lid can stay closed
#                                    (on power). Renders keep the machine budget from automation/queue.json.
#   com.remotion.autopilot.publish   every --publish-every minutes: uploads Instagram items whose time has
#                                    come and retries failed uploads (YouTube and Facebook schedule themselves).
# Logs: automation/logs/launchd-*.log. `launchctl list | grep remotion` shows state.
# Run from the project root. Requires node on PATH (its absolute path is baked into the plist).
set -euo pipefail

PROJECT="$(pwd)"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOUR=1; MINUTE=30; EVERY=30; UNINSTALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --hour) HOUR="$2"; shift 2 ;;
    --minute) MINUTE="$2"; shift 2 ;;
    --publish-every) EVERY="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "Unknown option $1" >&2; exit 1 ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "launchd is macOS only. On Linux use cron, e.g.:"
  echo "  30 1 * * *   cd $PROJECT && node $SKILL_DIR/scripts/autopilot.mjs plan && node $SKILL_DIR/scripts/autopilot.mjs run"
  echo "  */$EVERY * * * * cd $PROJECT && node $SKILL_DIR/scripts/autopilot.mjs publish-due"
  exit 0
fi

AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$PROJECT/automation/logs"
NODE="$(command -v node)"
UID_NUM="$(id -u)"
PRODUCE="$AGENTS/com.remotion.autopilot.produce.plist"
PUBLISH="$AGENTS/com.remotion.autopilot.publish.plist"

if [ "$UNINSTALL" -eq 1 ]; then
  for p in "$PRODUCE" "$PUBLISH"; do
    launchctl bootout "gui/$UID_NUM" "$p" 2>/dev/null || true
    rm -f "$p"
  done
  echo "Removed autopilot agents."
  exit 0
fi

[ -f "$PROJECT/automation/queue.json" ] || cp "$SKILL_DIR/assets/automation/queue.example.json" "$PROJECT/automation/queue.json"
[ -f "$PROJECT/automation/topics.md" ] || cp "$SKILL_DIR/assets/automation/topics.example.md" "$PROJECT/automation/topics.md"
[ -f "$PROJECT/automation/writer-prompt.md" ] || cp "$SKILL_DIR/assets/automation/writer-prompt.md" "$PROJECT/automation/writer-prompt.md"

# PATH for launchd jobs: Homebrew, nvm/volta shims, system.
JOB_PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"

cat > "$PRODUCE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.remotion.autopilot.produce</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-i</string>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd "$PROJECT" &amp;&amp; "$NODE" "$SKILL_DIR/scripts/autopilot.mjs" plan &amp;&amp; "$NODE" "$SKILL_DIR/scripts/autopilot.mjs" run</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$JOB_PATH</string><key>HOME</key><string>$HOME</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>
  <key>StandardOutPath</key><string>$PROJECT/automation/logs/launchd-produce.log</string>
  <key>StandardErrorPath</key><string>$PROJECT/automation/logs/launchd-produce.log</string>
  <key>Nice</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
EOF

cat > "$PUBLISH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.remotion.autopilot.publish</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd "$PROJECT" &amp;&amp; "$NODE" "$SKILL_DIR/scripts/autopilot.mjs" publish-due</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$JOB_PATH</string><key>HOME</key><string>$HOME</string></dict>
  <key>StartInterval</key><integer>$((EVERY * 60))</integer>
  <key>StandardOutPath</key><string>$PROJECT/automation/logs/launchd-publish.log</string>
  <key>StandardErrorPath</key><string>$PROJECT/automation/logs/launchd-publish.log</string>
</dict></plist>
EOF

for p in "$PRODUCE" "$PUBLISH"; do
  launchctl bootout "gui/$UID_NUM" "$p" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$p"
done
echo "Installed:"
echo "  produce  daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE")  -> plan + run (3 videos, scheduled uploads)"
echo "  publish  every $EVERY min          -> publish-due (Instagram at its slot, retries)"
echo "Edit automation/queue.json (slots, timezone, handle, budget) and automation/topics.md (backlog)."
echo "Test now:   launchctl kickstart -k gui/$UID_NUM/com.remotion.autopilot.produce"
echo "Remove:     bash $SKILL_DIR/scripts/install-autopilot.sh --uninstall"
echo "Note: launchd jobs run only while the Mac is awake; caffeinate keeps it awake during production on power. Use a Power schedule (System Settings > Energy, or pmset repeat wake) to wake before $HOUR:$MINUTE."
