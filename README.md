# darroo – Content-Pipeline in Code (statt n8n)

Dieses Repo ersetzt die bisherige n8n-Automatisierung durch einen eigenen,
config-getriebenen Dienst. Grundlage ist die interne Doku "darroo – Was wir
gebaut haben und warum". Umgesetzt sind die dort als Nächstes gewünschten
Punkte:

- **Umbau auf eigenen Code** – keine n8n-Instanz mehr nötig.
- **Gemeinsamer Kern für alle Kanäle** – ein neuer Kanal ist eine Config-Datei
  unter `src/config/channels/`, kein Neubau (`src/pipeline/` ist generisch).
- **Richtige Datenbank statt Tabelle** – Postgres statt Google-Sheet/Airtable.
- **Primärquellen-Prüfung** – auch für den Familien-Kanal, nicht nur Events.
- **Prüfung, ob die Quelle wirklich der Veranstalter ist** – eigener
  AI-Schritt (`src/ai/prompts/verifySource.ts`), bevor geschrieben wird.
- **Günstiges Modell zum Filtern, starkes nur zum Schreiben** – `gpt-4o-mini`
  für Relevanz-/Betrugs-Checks, `gpt-4o` nur für den finalen Text.
- **Wettercheck in der Orte-Datenbank** – kostenlose Open-Meteo-API.
- **Interne Posting-Liste mit Kopier-Buttons** – `/internal/posts`.
- **Bezahlung + kurze Freigabe bei Inseraten** – Fraud-Pre-Check direkt bei
  Einreichung, Freigabe erst nach Zahlungsbestätigung.
- **Fehler werden gemeldet statt still zu scheitern** – jeder Schritt loggt
  Fehler in die DB (`pipeline_errors`) und optional per Telegram.

Nicht in diesem Schritt enthalten (bewusst zurückgestellt, um die Kern-Pipeline
klein und lieferbar zu halten): Empfehlungs-Gewinnspiel/Growth-Mechanik,
Mediadaten-Seite, WG-Premium, Klick-Tracking-Auswertung (die Tabelle `clicks`
existiert schon als Grundlage dafür).

## Architektur in einem Satz

**Ein** Node-Prozess (Fastify-Server + `node-cron`) + **eine** Postgres-DB auf
**einem** kleinen VPS. Kein Message-Queue, kein separates Scheduler-Tool,
kein n8n-Hosting.

```
Quellen (RSS/iCal/HTML) --collect--> raw_items --KI-Filter(günstig)-->
  relevant --cluster--> item_clusters --Primärquellen-Check(günstig)-->
  verified --KI-Writer(stark)--> posts (ready) --Mensch kopiert ins WhatsApp-->
  posted
```

Die Orte-Datenbank (`places`) läuft parallel dazu: Inhalte werden einmal per
KI angelegt (`src/places/intake.ts`), danach rein regelbasiert (kein
KI-Aufruf mehr) zweimal täglich nach "am längsten nicht gepostet" +
Wetter/Saison-Filter ausgewählt (`src/places/scheduler.ts`) – spart laufende
KI-Kosten bei wiederholtem Posten.

## Projektstruktur

```
src/
  db/            Drizzle-Schema + Client + Migrationen
  collectors/    RSS/iCal/HTML-Collector (pluggable, pro Quelle konfiguriert)
  ai/            OpenAI-Client + Prompts (Filter, Verify, Write, Fraud-Check)
  pipeline/      Der generische Kern: run.ts orchestriert steps/*.ts
  config/channels/  EIN Kanal = EINE Datei hier (Thema, Quellen, Schwellwerte)
  places/        Orte-Datenbank: Intake, Scheduler, Wetter, Änderungsmeldung
  listings/      Inserate: Intake, Fraud-Check, Zahlung, Freigabe
  posting/       Interne Web-UI (Posting-Liste, Review-Queues)
  notify/        Fehlermeldung (Konsole + optional Telegram)
  jobs/          Einstiegspunkte: server.ts (Dauerbetrieb), CLI-Skripte
```

## Setup (lokal)

```bash
cp .env.example .env    # DATABASE_URL, OPENAI_API_KEY, INTERNAL_ACCESS_TOKEN setzen
docker compose up -d    # Postgres lokal
npm install
npm run db:generate     # Migration aus dem Schema erzeugen (einmalig & bei Schema-Änderungen)
npm run db:migrate      # Migration anwenden
npm run dev             # Server mit Hot-Reload auf PORT (default 3000)
```

Interne Seiten: `http://localhost:3000/internal/posts?token=<INTERNAL_ACCESS_TOKEN>`
(ebenso `/internal/places/review`, `/internal/places/new`, `/internal/listings/review`).

Einen Kanal einmalig manuell testen, ohne auf den Cron zu warten:

```bash
npm run run:channel -- --channel=events-muenchen
npm run run:places
```

## Quellen eintragen

Die Dateien unter `src/config/channels/*.ts` enthalten Platzhalter-Quellen
(`TODO: ...`). Für jede echte Quelle einen Eintrag ersetzen:

- **RSS/Atom-Feed vorhanden** → `kind: "rss"`, nur `url` nötig.
- **iCal-Feed vorhanden** (viele Veranstalter/Locations bieten das an)
  → `kind: "ical"`.
- **Nur eine normale Webseite ohne Feed** → `kind: "html"` +
  `selectorConfig` (CSS-Selektoren für Listenelement, Titel, Link, Datum, Ort).

`trustTier: "primary"` = offizielle Veranstalter-/Behördenseite (wird ohne
zusätzlichen KI-Check als Primärquelle akzeptiert). `trustTier: "secondary"`
= Presse/Aggregator (zählt für "mehrere Erwähnungen", braucht aber eine
Primärquelle im selben Cluster, bevor ein Post geschrieben wird).

Einen neuen Kanal hinzufügen: Datei nach dem Muster von
`src/config/channels/events-munich.ts` anlegen und in
`src/config/channels/index.ts` eintragen. Das ist der komplette Aufwand –
keine neue Pipeline-Logik nötig.

## Deployment (günstiger VPS, z.B. Hetzner CX22, ~4–5 €/Monat)

```bash
# Auf dem Server:
sudo apt install -y docker.io docker-compose-plugin
git clone <dieses-repo>
cd darroo
cp .env.example .env    # echte Werte eintragen
docker compose up -d    # Postgres

# Node 20+ installieren (z.B. via nvm), dann:
npm install
npm run build
npm run db:migrate

# Dauerhaft laufen lassen, z.B. mit systemd:
```

`/etc/systemd/system/darroo.service`:

```ini
[Unit]
Description=darroo
After=network.target docker.service

[Service]
WorkingDirectory=/opt/darroo
EnvironmentFile=/opt/darroo/.env
ExecStart=/usr/bin/node dist/jobs/server.js
Restart=on-failure
User=darroo

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now darroo
```

Das war's: ein Prozess, ein systemd-Unit, kein separater Scheduler. Updates:
`git pull && npm install && npm run build && npm run db:migrate && sudo systemctl restart darroo`.

### Fehlerbenachrichtigung (kostenlos)

Einen Telegram-Bot anlegen (`@BotFather`, kostenlos), Token + eigene
Chat-ID in `.env` eintragen (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) –
danach kommt bei jedem Pipeline-Fehler eine Push-Nachricht, statt dass ein
Lauf lautlos fehlschlägt.

## Kostenvergleich (grobe Richtwerte)

| Posten | Vorher (n8n) | Jetzt |
| --- | --- | --- |
| Hosting/Workflow-Tool | n8n Cloud ab ~20 €/Monat, oder eigener n8n-Server + Wartung | 1 kleiner VPS (~5 €/Monat) für Code + DB |
| KI-Kosten pro Kandidat | oft ein teures Modell für alles | `gpt-4o-mini` für Filter/Fraud-Check (Centbeträge), `gpt-4o` nur 1x pro fertigem Post |
| Orte-Reposting | — | 0 € KI-Kosten (regelbasiert, kein Modellaufruf) |
| Fehler-Transparenz | lief oft lautlos durch | Telegram-Alert kostenlos |
| Neuer Kanal | neuer n8n-Workflow bauen | eine Config-Datei |

Die tatsächliche KI-Kosten hängen von der Anzahl der Quellen/Kandidaten pro
Tag ab – `run_logs.stats` protokolliert pro Lauf, wie viele Items durch
jeden Schritt gelaufen sind, damit sich das beobachten lässt.

## Datenbank-Admin

`npm run db:studio` öffnet Drizzle Studio (Browser-UI) auf der konfigurierten
`DATABASE_URL` – praktisch, um Einträge direkt anzusehen/zu korrigieren,
ohne psql zu brauchen.
