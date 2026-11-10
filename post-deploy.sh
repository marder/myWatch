#!/usr/bin/env bash
# ==============================================================================
# Poland Macro Crisis Radar — Post-Deploy Hook / Script
# Uruchamiany automatycznie PO pobraniu najnowszych plików z repozytorium.
# ==============================================================================

set -e

# 1. Instalacja / aktualizacja zależności produkcyjnych
npm install --omit=dev --no-audit --no-fund

# 2. Restart aplikacji Node.js
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload macro-radar 2>/dev/null || pm2 restart macro-radar 2>/dev/null || pm2 restart all
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q "macro-radar.service"; then
  sudo systemctl restart macro-radar
else
  pkill -f "node.*server.js" || true
  nohup node server.js > app.log 2>&1 &
fi

echo "✓ Post-deploy zakończony pomyślnie!"
