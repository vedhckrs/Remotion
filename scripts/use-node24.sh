# Source from the repository root: source scripts/use-node24.sh
if [ ! -x "$PWD/.runtime/node24/bin/node" ]; then
  echo 'Run from the repository root after installing its Node 24 runtime.' >&2
  return 1 2>/dev/null || exit 1
fi
export PATH="$PWD/.runtime/node24/bin:$PATH"
