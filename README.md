# Osservatorio golpe

Colpi di stato dal 1900 a oggi e stima del rischio per paese.
Pipeline dati in Python (`pipeline/`), sito in Next.js con API (`app/`, `components/`, `lib/`).

## Struttura

| Cartella | Contenuto |
|---|---|
| `pipeline/` | scaricamento delle fonti, database dei golpe, modello, esportazione per il sito |
| `data/raw/` | dati grezzi scaricati (non nel repository) |
| `data/coupdb/` | database unificato dei golpe, con il suo README |
| `webdata/` | file JSON letti dal sito, prodotti dalla pipeline |
| `app/`, `components/`, `lib/` | sito e API |

## Aggiornare i dati

```bash
python3 pipeline/fetch_coups.py
```

```bash
python3 pipeline/fetch_coup_sources.py
```

```bash
python3 pipeline/fetch_acled.py
```

```bash
python3 pipeline/build_coupdb.py
```

```bash
python3 pipeline/run.py
```

In ordine: Powell & Thyne; le altre fonti sui golpe (per V-Dem e PIPE serve R); gli eventi ACLED via API
(chiede email e password myACLED a terminale, serve un account con accesso agli eventi); l'incrocio delle
fonti in `data/coupdb/`; modello ed esportazione in `webdata/`.

Opzioni di `run.py`: `--horizon 12` cambia l'orizzonte (default 6 mesi), `--coups pt` usa solo
Powell & Thyne, `--demo` usa dati sintetici (`python3 pipeline/make_demo_data.py`).

## Sito in locale

```bash
npm install
```

```bash
npm run dev
```

## API

| Indirizzo | Risposta |
|---|---|
| `/api/meta` | metadati, metriche del modello, serie aggregate |
| `/api/countries?q=` | elenco paesi con rischio e sintesi dei golpe |
| `/api/countries/[slug]` | scheda completa di un paese |
| `/api/coups?conf=C&from=&to=&country=&type=&dup=` | eventi del database dei golpe |
| `/api/timeline?conf=C` | tentativi per anno |

Le API leggono i file in `webdata/` attraverso `lib/data.js`, unico punto da cambiare se i dati
passano a un database.

## Deploy su Vercel

Importa il repository su Vercel: riconosce Next.js da solo, senza configurazione. A ogni aggiornamento
dei dati vanno rieseguita la pipeline e caricati `webdata/` e `data/coupdb/`.

Prima di pubblicare controlla le condizioni d'uso di ACLED: richiedono l'attribuzione e limitano la
ridistribuzione. Il sito contiene conteggi mensili per paese, non gli eventi grezzi.

## Modello

- **Target**: almeno un tentativo di golpe nei successivi N mesi, tra gli eventi confermati da almeno due
  fonti accademiche o presenti in Powell & Thyne.
- **Variabili**: storia golpista del paese e della regione, più tre indicatori ACLED misurati rispetto alla
  norma del paese (impennata di proteste e disordini, scontri recenti tra forze statali, quota di proteste
  represse). I conteggi assoluti non sono usati: crescono con la copertura ACLED.
- **Validazione**: finestra espandibile anno per anno, metriche tutte fuori campione.
- **Risultato**: la storia golpista spiega quasi tutta la capacità predittiva; ACLED aggiunge poco.
