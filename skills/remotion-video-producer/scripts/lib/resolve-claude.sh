# Sourced by the launchd installers. resolve_claude prints the claude binary your login shell runs
# (following an alias such as the one the Claude Code local installer adds to ~/.zshrc), or nothing.
# launchd jobs do not read ~/.zshrc, so without this they can start a different claude, or none.
resolve_claude() {
  local out="" c
  if [ -n "${SHELL:-}" ] && [ -x "$SHELL" ]; then
    out="$("$SHELL" -lic 'command -v claude' 2>/dev/null </dev/null | tail -n 1)"
  fi
  case "$out" in
    "alias claude="*) out="${out#alias claude=}" ;;
    "claude="*) out="${out#claude=}" ;;
  esac
  out="${out#\'}"; out="${out%\'}"; out="${out#\"}"; out="${out%\"}"; out="${out%% *}"
  case "$out" in "~/"*) out="$HOME/${out#\~/}" ;; esac
  if [ -n "$out" ] && [ -f "$out" ] && [ -x "$out" ]; then printf '%s\n' "$out"; return 0; fi
  for c in "$(command -v claude 2>/dev/null || true)" "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude; do
    if [ -n "$c" ] && [ -f "$c" ] && [ -x "$c" ]; then printf '%s\n' "$c"; return 0; fi
  done
  return 0
}
