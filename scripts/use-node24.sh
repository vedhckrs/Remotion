# Source this file from the repository root to use its pinned Node runtime.
NURADI_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")/.." && pwd)"
if [ ! -x "$NURADI_REPO_ROOT/.runtime/node24/bin/node" ]; then
  echo 'Install Node 24 and set PATH to its bin directory.' >&2
  return 1 2>/dev/null || exit 1
fi
export PATH="$NURADI_REPO_ROOT/.runtime/node24/bin:$PATH"
unset NURADI_REPO_ROOT
