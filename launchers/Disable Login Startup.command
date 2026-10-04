#!/bin/zsh
set -eu
workspace="${0:A:h}/.."
cd "$workspace"
runtime=""
candidates=("${MASAFLOW_NODE:-}" "${commands[node]:-}" "$HOME/.local/bin/node" /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node(N) "$HOME"/.local/share/fnm/node-versions/*/installation/bin/node(N))
for candidate in "${candidates[@]}"; do
  [[ -n "$candidate" && -x "$candidate" ]] || continue
  if "$candidate" -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22||(major===22&&minor>=12)?0:1)' >/dev/null 2>&1; then
    runtime="$candidate"
    break
  fi
  if [[ -n "${MASAFLOW_NODE:-}" && "$candidate" == "$MASAFLOW_NODE" ]]; then
    break
  fi
done
if [[ -z "$runtime" ]]; then
  print -u2 "MasaFlow needs Node.js 22.12 or newer. Install Node.js, or set MASAFLOW_NODE to its executable."
  read -r "?Press Return to close this window."
  exit 1
fi
if ! "$runtime" "$workspace/scripts/mac-login.cjs" uninstall --workspace "$workspace"; then
  print -u2 "MasaFlow could not complete this action. The error is shown above."
  read -r "?Press Return to close this window."
  exit 1
fi
read -r "?Login startup is disabled. Saved orders and backups are retained. Press Return to close this window."
