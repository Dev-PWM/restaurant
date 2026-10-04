#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1 || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=12) ? 0 : 1)' ; then
  echo "Instala Node.js 22.12 o posterior desde https://nodejs.org y abre este archivo otra vez."
  read -r -p "Presiona Enter para cerrar…" || true
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "No se encontró npm. Reinstala Node.js desde https://nodejs.org."
  exit 1
fi
if [ ! -d node_modules ] || [ ! -f node_modules/socket.io/package.json ] || [ ! -f node_modules/vite/package.json ]; then
  echo "Preparando MasaFlow por primera vez. Se necesita Internet para instalar."
  npm ci --no-audit --no-fund
fi
if ! node -e 'try{process.loadEnvFile()}catch{}; process.exit(/^\d{4}$/.test(process.env.MASAFLOW_STAFF_PIN||"") ? 0 : 1)' ; then
  echo "Elige un PIN de 4 dígitos para el personal."
  while true; do
    read -r -s -p "Nuevo PIN: " masaflow_pin
    echo
    if [[ "$masaflow_pin" =~ ^[0-9]{4}$ ]]; then break; fi
    echo "Usa exactamente 4 dígitos."
  done
  # Write only the PIN setting; preserve all existing restaurant configuration.
  MASAFLOW_NEW_PIN="$masaflow_pin" node - <<'JS'
const fs = require('node:fs');
let text = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
text = text.replace(/^\s*(?:export\s+)?MASAFLOW_STAFF_PIN\s*=.*$/gm, '');
fs.writeFileSync('.env', `${text.trimEnd()}\nMASAFLOW_STAFF_PIN=${process.env.MASAFLOW_NEW_PIN}\n`, { mode: 0o600 });
fs.chmodSync('.env', 0o600);
JS
  unset masaflow_pin
fi
# exec lets Terminal's close signal reach the supervisor, which stops only its own children.
exec node scripts/dev.cjs --open
