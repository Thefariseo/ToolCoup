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
python3 pipeline/fetch_structural.py
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

In ordine: Powell & Thyne; le altre fonti sui golpe; le variabili strutturali da V-Dem e Banca Mondiale;
gli eventi ACLED via API (chiede email e password myACLED a terminale, serve un account con accesso agli
eventi); l'incrocio delle fonti in `data/coupdb/`; modello ed esportazione in `webdata/`.
Per V-Dem e PIPE serve R installato.

`run.py` impiega diversi minuti: riaddestra tre modelli per ogni anno dal 1975. Opzioni: `--boot 0` salta
gli intervalli di incertezza, `--horizon 12` cambia l'orizzonte (default 6 mesi).

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

- **Campione**: paese-mesi dal 1950 a oggi (circa 160.000), non solo il periodo coperto da ACLED.
- **Target**: almeno un tentativo di golpe nei successivi N mesi, tra gli eventi confermati da almeno due
  fonti accademiche o presenti in Powell & Thyne.
- **Variabili** (`pipeline/panel.py`): storia golpista, contagio regionale e globale, regime, leader ed
  elezioni, economia, mobilitazione annuale, segnali mensili ACLED relativi alla norma del paese. Ogni
  variabile entra solo quando la fonte l'aveva già pubblicata.
- **Insieme** (`pipeline/model.py`): media di regressione logistica regolarizzata, gradient boosting e
  foresta casuale, poi calibrazione di Platt stimata solo sul passato.
- **Validazione**: finestra espandibile anno per anno dal 1975; AUC-ROC, AUC-PR, Brier, calibrazione per
  fasce, confronti per sottrazione con intervalli da ricampionamento dei paesi.
- **Incertezza**: intervallo all'80% per ogni paese, da riaddestramenti su paesi ricampionati.
