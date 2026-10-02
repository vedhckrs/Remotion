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
PROJECT_KEY="$(printf '%s' "$PROJECT" | shasum -a 256 | cut -c 1-12)"
PRODUCE_LABEL="com.remotion.autopilot.$PROJECT_KEY.produce"
PUBLISH_LABEL="com.remotion.autopilot.$PROJECT_KEY.publish"
PRODUCE="$AGENTS/$PRODUCE_LABEL.plist"
PUBLISH="$AGENTS/$PUBLISH_LABEL.plist"

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
# The same claude your Terminal runs (an alias in ~/.zshrc is followed), so the writer uses your login.
. "$SKILL_DIR/scripts/lib/resolve-claude.sh"
CLAUDE_BIN="$(resolve_claude)"
[ -n "$CLAUDE_BIN" ] && JOB_PATH="$(dirname "$CLAUDE_BIN"):$JOB_PATH"

node --input-type=module - "$SKILL_DIR" "$PROJECT" "$NODE" "$JOB_PATH" "${CLAUDE_BIN:-claude}" "$PRODUCE" "$PUBLISH" "$PRODUCE_LABEL" "$PUBLISH_LABEL" "$HOUR" "$MINUTE" "$EVERY" <<'JS'
import fs from 'node:fs';
const [skill,project,node,jobPath,claude,produce,publish,produceLabel,publishLabel,hour,minute,every]=process.argv.slice(2);
if (![hour,minute,every].every(x=>/^\d+$/.test(x)) || +hour>23 || +minute>59 || +every<1)throw new Error('Invalid schedule');
const xml=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const strings=(a)=>a.map(x=>`<string>${xml(x)}</string>`).join('');
const common=(label,args,schedule,log)=>`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${xml(label)}</string><key>ProgramArguments</key><array>${strings(args)}</array><key>WorkingDirectory</key><string>${xml(project)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(jobPath)}</string><key>CLAUDE_BIN</key><string>${xml(claude)}</string></dict>${schedule}<key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string></dict></plist>`;
fs.writeFileSync(produce,common(produceLabel,['/usr/bin/caffeinate','-i',node,skill+'/scripts/autopilot.mjs','daily'],`<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${+hour}</integer><key>Minute</key><integer>${+minute}</integer></dict>`,project+'/automation/logs/launchd-produce.log'));
fs.writeFileSync(publish,common(publishLabel,[node,skill+'/scripts/autopilot.mjs','publish-due'],`<key>StartInterval</key><integer>${+every*60}</integer>`,project+'/automation/logs/launchd-publish.log'));
JS
plutil -lint "$PRODUCE" "$PUBLISH"

for p in "$PRODUCE" "$PUBLISH"; do
  launchctl bootout "gui/$UID_NUM" "$p" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$p"
done
echo "Installed:"
echo "  produce  daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE")  -> plan + run (3 videos, scheduled uploads)"
echo "  publish  every $EVERY min          -> publish-due (Instagram at its slot, retries)"
echo "Edit automation/queue.json (slots, timezone, handle, budget) and automation/topics.md (backlog)."
echo "Test now:   launchctl kickstart -k gui/$UID_NUM/$PRODUCE_LABEL"
echo "Remove:     bash $SKILL_DIR/scripts/install-autopilot.sh --uninstall"
echo "Note: launchd jobs run only while the Mac is awake; caffeinate keeps it awake during production on power. Use a Power schedule (System Settings > Energy, or pmset repeat wake) to wake before $HOUR:$MINUTE."
