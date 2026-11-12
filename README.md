# Poland Macro Crisis Radar 🇵🇱
### Radar Ryzyka Makroekonomicznego i Giełdowego Polski

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Chart.js](https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chart.js&logoColor=white)](https://www.chartjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Samodzielna platforma analityczna (self-hosted) monitorująca w czasie rzeczywistym stabilność polskiego systemu finansowego, dynamikę krzywej dochodowości obligacji skarbowych, premię za ryzyko kraju (spread PL-DE), presję walutową (USD/PLN, EUR/PLN) oraz koniunkturę na Giełdzie Papierów Wartościowych w Warszawie (WIG, WIG20, mWIG40, sWIG80, WIG-Banki).

Aplikacja oblicza zagregowany **Wskaźnik Presji Kryzysowej (0–100 pkt)**, formułuje dedykowane wnioski dla funduszy dłużnych i akcji GPW, dostarcza bezżargonowy przewodnik dla każdego gospodarstwa domowego oraz integruje najświeższe wiadomości gospodarcze.

---

## 📸 Główne Moduły Systemu

1. **Zbiorczy Indeks Ryzyka (0–100 pkt) & 4 Filary:**
   * Klasyfikacja reżimu rynkowego: `STABILNY` (0–25), `OSTRZEŻENIE` (26–50), `PODWYŻSZONE RYZYKO` (51–75), `ALARM KRYZYSOWY` (76–100).
   * Wizualizacja postępów każdego z 4 filarów oraz generowanie sygnałów ostrzegawczych w czasie rzeczywistym.

2. **Dla Każdego — Co to oznacza w prostych słowach?**
   * Przewodnik po stanie gospodarki całkowicie pozbawiony żargonu bankowego.
   * Praktyczne wskazówki dla 4 kluczowych obszarów:
     * 🏦 **Oszczędności i Lokaty:** co robić z gotówką, kiedy kupować obligacje skarbowe (COI/EDO/TOS).
     * 🏠 **Kredyty i Raty:** prognoza stawek procentowych (WIBOR/WIRON) i kosztu rat.
     * 📈 **Inwestycje (IKE/IKZE/ETF):** zalecana postawa (np. metoda DCA vs bufor gotówkowy).
     * 💱 **Waluty i Wyjazdy:** kondycja złotego, wpływ na zakupy zagraniczne i wakacje.
   * Szybki słowniczek pojęć (inwersja krzywej, spread kredytowy, średnia SMA200).

3. **Tablica Kluczowych Notowań GPW:**
   * Monitorowanie głównych benchmarków warszawskiego parkietu: **WIG**, **WIG20**, **mWIG40**, **sWIG80** oraz **WIG-Banki**.
   * Wycena punktowa, zmiana dzienna % oraz ocena techniczna (*Hossa*, *Wzrost*, *Korekta*).

4. **Puls Rynku — Live Newsy Gospodarcze:**
   * Agregacja na żywo oficjalnych wiadomości ekonomicznych z **Bankier.pl** (i PAP/TVN24 Biznes).
   * Zwięzłe leady, czas publikacji w formacie relatywnym (np. *„25 min temu”*) i bezpośrednie linki do pełnych artykułów.
   * Wbudowana pamięć podręczna (cache TTL 5 min) chroniąca źródła przed nadmiarowymi zapytaniami.

5. **Wykresy Analityczne Chart.js (Dark Mode):**
   * Historia Indeksu Ryzyka z gradientem stref ostrzegawczych.
   * Nachylenie krzywej dochodowości z wyróżnioną linią zerową inwersji (0.00 pp.).
   * Kursy walut NBP (USD/PLN oraz EUR/PLN).
   * WIG na tle 200-sesyjnej średniej kroczącej (SMA200).

6. **Zarządzanie Bazą Danych & Bezpieczeństwo:**
   * Autoryzacja administratora zabezpieczona tokenem sesyjnym.
   * **Pobieranie kopii bazy danych (`.db`)** na dysk jednym kliknięciem z bezpiecznym zrzutem WAL (`PRAGMA wal_checkpoint`).
   * **Wysyłka kopii zapasowej na e-mail (SMTP)** — na żądanie oraz w automatycznym harmonogramie niedzielnym.
   * **Głęboki backfill danych** — zasilanie bazy historią na 60, 120 lub 250 sesji giełdowych.

7. **Modelowy Portfel & Strategia OKI (Osobiste Konta Inwestycyjne od 2027 r.):**
   * Dynamiczny podział aktywów w portfelu dopasowany do bieżącego reżimu makroekonomicznego oraz profilu inwestora nastawionego na obniżone ryzyko (wzrost zrównoważony).
   * Konkretne instrumenty giełdowe i detaliczne: **Vanguard FTSE All-World (VWCE)**, **Beta ETF WIG20TR / mWIG40TR**, **Beta ETF TBSP** oraz obligacje detaliczne **TOS / COI**.
   * **Interaktywny Kalkulator Dopłat:** automatyczne rozbicie comiesięcznej kwoty w PLN na poszczególne aktywa i tickery.
   * Przewodnik po zasadach OKI: limit 100 000 zł bez podatku Belki, podlimit 25 000 zł na bezpieczne depozyty/obligacje detaliczne, min. 75 000 zł na instrumenty rynku kapitałowego oraz pełna płynność środków.

---

## 🧮 4-Filarowy Model Scoringowy (0–100 Punktów)

Wskaźnik ryzyka jest sumą punktów z 4 niezależnych filarów rynkowych:

### Filar 1: Nachylenie Krzywej Dochodowości Skarbowej (Maks. 30 pkt)
* **Wskaźnik:** `spread_10y_2y = PL10Y - PL2Y`
* `spread < -0.35 pp.`: **30 pkt** — Głęboka inwersja (silny sygnał recesyjny).
* `-0.35 <= spread < -0.10 pp.`: **22 pkt** — Inwersja umiarkowana (rynek obligacji wycenia hamowanie gospodarki).
* `-0.10 <= spread <= 0.15 pp.`: **12 pkt** — Płaska krzywa dochodowości (faza przejściowa cyklu stóp).
* `spread > 0.15 pp.` oraz skok `PL10Y > +0.50 pp.` w 20 sesji: **15 pkt** — Gwałtowna wyprzedaż długu (rosnący koszt kapitału).
* W pozostałych przypadkach: **0 pkt**.

### Filar 2: Spread Kredytowy PL vs DE (Maks. 25 pkt)
* **Wskaźnik:** `spread_pl_de = (PL10Y - DE10Y) * 100` (w punktach bazowych - bps)
* `spread > 400 bps`: **25 pkt** — Krytyczny spread kredytowy (silna ucieczka zagranicznego kapitału z Polski).
* `330 < spread <= 400 bps`: **18 pkt** — Wysoka premia za ryzyko kraju (presja fiskalna lub geopolityczna).
* `270 < spread <= 330 bps`: **8 pkt** — Umiarkowanie podwyższony spread względem bundów niemieckich.
* `spread <= 270 bps`: **0 pkt**.

### Filar 3: Presja Walutowa FX — USD/PLN & EUR/PLN (Maks. 25 pkt)
* **Wskaźnik:** Dynamika 30-dniowa (22 sesje giełdowe) dla USD/PLN i EUR/PLN
* `usd_30d > 6.5%` LUB `eur_30d > 4.5%`: **25 pkt** — Gwałtowna ucieczka od złotego (globalny tryb Risk-Off).
* `4.0 < usd_30d <= 6.5%` LUB `2.5 < eur_30d <= 4.5%`: **15 pkt** — Wyraźne osłabienie PLN (odpływ kapitału portfelowego).
* `2.0 < usd_30d <= 4.0%`: **6 pkt** — Lekka presja podażowa na złotym.
* W pozostałych przypadkach: **0 pkt**.

### Filar 4: Reżim Techniczny GPW — WIG vs SMA200 (Maks. 20 pkt)
* **Wskaźnik:** Odchylenie indeksu WIG od średniej kroczącej 200-sesyjnej (`SMA200`) i momentum 20-sesyjne
* `wig_vs_sma200 < -12.0%`: **20 pkt** — Rynek niedźwiedzia na GPW (WIG głęboko poniżej SMA200).
* `-12.0% <= wig_vs_sma200 < -3.0%`: **12 pkt** — Osłabienie trendu długoterminowego (poniżej SMA200).
* `wig_vs_sma200 >= -3.0%` oraz spadek `wig_20d < -8.0%`: **10 pkt** — Gwałtowna krótkoterminowa korekta rynkowa.
* W pozostałych przypadkach: **0 pkt**.

---

## 🚀 Szybki Start

### Wymagania
* Node.js v18 lub nowszy (zalecana wersja 20+)
* npm v9+

### Instalacja i uruchomienie

```bash
# 1. Klonowanie repozytorium
git clone https://github.com/marder/myWatch.git
cd myWatch

# 2. Instalacja zależności
npm install

# 3. Konfiguracja środowiska
cp .env.example .env

# 4. Uruchomienie aplikacji
npm start
```

Otwórz w przeglądarce: **`http://localhost:8000`**.

Przy pierwszym starcie serwer automatycznie przeprowadza backfill danych historycznych, dzięki czemu dashboard i wykresy są od razu wypełnione danymi.

---

## ⚙️ Konfiguracja Środowiskowa (`.env`)

Wszystkie parametry konfiguracyjne i poświadczenia zarządzane są przez plik `.env`:

| Zmienna | Domyślna wartość | Opis |
| :--- | :--- | :--- |
| `PORT` | `8000` | Port, na którym nasłuchuje serwer HTTP |
| `ADMIN_USER` | `admin` | Login administratora bazy danych |
| `ADMIN_PASSWORD` | *(brak)* | Hasło administratora (ustaw w `.env`) |
| `CRON_SCHEDULE` | `10 17 * * 1-5` | Harmonogram aktualizacji rynkowej i powiadomień (Pn-Pt 17:10, zaraz po zamknięciu GPW o 17:05) |
| `BACKFILL_DAYS` | `60` | Liczba sesji pobieranych przy pierwszym uruchomieniu |
| `EMAIL_BACKUP_ENABLED` | `false` | Czy włączyć automatyczny backup na e-mail |
| `BACKUP_EMAIL_TO` | `twoj@email.pl` | Adres odbiorcy kopii bazy danych |
| `EMAIL_BACKUP_SCHEDULE`| `0 3 * * 0` | Harmonogram wysyłki e-mail (niedziela 03:00) |
| `SMTP_HOST` | *(brak)* | Adres serwera pocztowego SMTP |
| `SMTP_PORT` | `587` | Port serwera pocztowego |
| `SMTP_USER` | *(brak)* | Użytkownik konta pocztowego |
| `SMTP_PASS` | *(brak)* | Hasło konta pocztowego |

---

## 📡 Specyfikacja REST API

### Punkty końcowe publiczne:
* `GET /api/latest` — Zwraca najnowszy odczyt wskaźnika ryzyka, filary, ostrzeżenia, wnioski, diagnozę prostym językiem oraz notowania indeksów GPW.
* `GET /api/history?limit=60` — Chronologiczny szereg czasowy (ASC) do wykresów i tabel.
* `GET /api/allocation` — Zwraca aktualne dynamiczne wagi portfela, konkretne tickery instrumentów oraz wytyczne OKI.
* `POST /api/allocation/calculate` — Rozbija comiesięczną kwotę dopłaty w PLN (`{ amountPln: 1500 }`) na poszczególne instrumenty.
* `GET /api/news` — Lista najświeższych wiadomości gospodarczych z Bankier.pl z bezpośrednimi linkami.
* `GET /api/gpw-indices` — Zestawienie aktualnych kursów i statusów indeksów GPW (WIG, WIG20, mWIG40, sWIG80, WIG-Banki).
* `POST /api/refresh` — Natychmiastowe pobranie świeżych danych i rekalkulacja modelu.
* `GET /api/health` — Status kondycji serwera, czas uptime i liczba rekordów w bazie.

### Punkty końcowe administracyjne (`Authorization: Bearer <token>`):
* `POST /api/auth/login` — Logowanie poświadczeniami z `.env`, generowanie tokenu sesyjnego.
* `POST /api/auth/logout` — Unieważnienie aktywnego tokenu sesji.
* `GET /api/auth/me` — Weryfikacja ważności sesji administratora.
* `GET /api/admin/db/stats` — Szczegółowe statystyki bazy SQLite (rozmiar w KB, zakres dat, status SMTP).
* `GET /api/admin/db/download` — Bezpieczny zrzut WAL i pobranie pliku `macro_radar.db` na dysk.
* `POST /api/admin/db/email-backup` — Natychmiastowa wysyłka kopii bazy na wskazany adres e-mail.
* `POST /api/admin/db/backfill` — Zlecenie głębokiego backfillu na wybraną liczbę sesji (`{ days: 120 }`).

---

## 🛡️ Wdrożenie Produkcyjne (Deployment)

### Wariant 1: Menedżer procesów PM2

```bash
npm install -g pm2
pm2 start server.js --name "macro-radar" --time
pm2 save
pm2 startup
```

### Wariant 2: Usługa Linux systemd

Utwórz plik `/etc/systemd/system/macro-radar.service`:

```ini
[Unit]
Description=Poland Macro Crisis Radar Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/myWatch
ExecStart=/usr/bin/node /var/www/myWatch/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable macro-radar
sudo systemctl start macro-radar
```

### Wariant 3: NGINX Reverse Proxy z certyfikatem SSL

```nginx
server {
    listen 80;
    server_name radar.twojadomena.pl;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name radar.twojadomena.pl;

    ssl_certificate /etc/letsencrypt/live/radar.twojadomena.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/radar.twojadomena.pl/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📄 Licencja & Źródła Danych

Projekt objęty licencją **MIT**. Szczegóły w pliku [LICENSE](LICENSE) (lub nagłówku `package.json`).

Dane makroekonomiczne i giełdowe pozyskiwane są z oficjalnych i stabilnych źródeł odpornych na blokady hostingu chmurowego:
* **Narodowy Bank Polski (NBP API):** oficjalne kursy średnie walut (USD/PLN, EUR/PLN) oraz 255-sesyjne szeregi czasowe.
* **TradingView Live Scanner:** notowania na żywo rentowności długu skarbowego (`PL10Y`, `PL2Y`, `DE10Y Bund`) oraz indeksów warszawskiego parkietu (`WIG`, `WIG20`, `mWIG40`, `sWIG80`, `WIG-Banki`).
* **Bankier.pl:** kanał informacyjny RSS z bieżącym pulsem polskiej gospodarki.
* **Stooq.pl / Verified Market Baseline:** zapasowa baza danych historycznych.
