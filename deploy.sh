#!/usr/bin/env bash
# ==============================================================================
# Poland Macro Crisis Radar — Automatyczny Skrypt Wdrożeniowy (Deploy Script)
# ==============================================================================
# Skrypt pobiera najnowszą wersję z Git, instaluje zależności i restartuje aplikację.
#
# Użycie:
#   chmod +x deploy.sh
#   ./deploy.sh
# ==============================================================================

set -e # Zakończ w razie wystąpienia błędu

# Kolory do komunikatów
GREEN='\033[0;32m'
SKY='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${SKY}======================================================${NC}"
echo -e "${SKY}   Poland Macro Crisis Radar — Deployment Start       ${NC}"
echo -e "${SKY}======================================================${NC}"

# Przejście do katalogu, w którym znajduje się skrypt
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"
echo -e "📁 Katalog aplikacji: ${YELLOW}$APP_DIR${NC}"

# 1. Sprawdzenie istnienia pliku .env
if [ ! -f .env ]; then
  echo -e "${YELLOW}⚠️ Ostrzeżenie: Plik .env nie istnieje. Kopiuję szablon z .env.example...${NC}"
  if [ -f .env.example ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ Utworzono plik .env. Uzupełnij w nim hasła i konfigurację!${NC}"
  fi
fi

# 2. Bezpieczne pobranie najnowszego kodu z Git
echo -e "\n${SKY}📥 [1/4] Pobieranie zmian z repozytorium Git (origin/main)...${NC}"
git fetch origin main
git pull origin main

# 3. Instalacja i weryfikacja zależności npm
echo -e "\n${SKY}📦 [2/4] Weryfikacja i instalacja pakietów npm...${NC}"
npm install --omit=dev --no-audit --no-fund

# 4. Restart usługi aplikacji
echo -e "\n${SKY}🔄 [3/4] Restartowanie procesu serwera...${NC}"

RESTARTED=false

# Wariant A: Menedżer procesów PM2
if command -v pm2 >/dev/null 2>&1; then
  # Sprawdź czy proces jest już zarejestrowany w PM2
  if pm2 list | grep -qE "macro-radar|myWatch|server"; then
    echo -e "Wykryto proces w PM2. Restartowanie..."
    pm2 reload macro-radar 2>/dev/null || pm2 restart macro-radar 2>/dev/null || pm2 restart all
    RESTARTED=true
  else
    echo -e "Uruchamianie nowej instancji w PM2 pod nazwą 'macro-radar'..."
    pm2 start server.js --name "macro-radar" --time
    pm2 save
    RESTARTED=true
  fi
fi

# Wariant B: Usługa systemd (jeśli PM2 nie jest używane)
if [ "$RESTARTED" = false ] && command -v systemctl >/dev/null 2>&1; then
  if systemctl list-unit-files | grep -q "macro-radar.service"; then
    echo -e "Wykryto usługę systemd (macro-radar.service). Restartowanie..."
    sudo systemctl restart macro-radar
    RESTARTED=true
  fi
fi

# Wariant C: Fallback dla uruchomienia w tle (jeśli brak pm2 i systemd)
if [ "$RESTARTED" = false ]; then
  echo -e "${YELLOW}⚠️ Nie wykryto PM2 ani systemd. Restartowanie procesu w tle...${NC}"
  pkill -f "node.*server.js" || true
  nohup node server.js > app.log 2>&1 &
  echo -e "${GREEN}✓ Uruchomiono node server.js w tle (logi w app.log)${NC}"
  RESTARTED=true
fi

# 5. Sprawdzenie poprawności działania (Healthcheck)
echo -e "\n${SKY}🔍 [4/4] Testowanie dostępności serwera (Healthcheck)...${NC}"
sleep 2

PORT=$(grep -E "^PORT=" .env | cut -d '=' -f2 | tr -d ' "' || echo "8000")
PORT=${PORT:-8000}

if command -v curl >/dev/null 2>&1; then
  HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Serwer działa poprawnie! (Endpoint /api/health zwrócił HTTP 200)${NC}"
  else
    echo -e "${YELLOW}⚠️ Serwer odpowiada kodem HTTP: $HTTP_STATUS (poczekaj chwilę na zainicjalizowanie bazy)${NC}"
  fi
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   ✓ Wdrożenie zakończone sukcesem!                   ${NC}"
echo -e "${GREEN}======================================================${NC}\n"
