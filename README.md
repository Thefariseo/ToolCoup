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
| `registry/` | registro pubblico: una previsione archiviata per mese, mai modificata |
| `.github/workflows/` | aggiornamento mensile automatico |
| `docs/` | note sulla console (`console.md`) e sui segnali di innesco (`triggers.md`) |
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

## Registro delle previsioni

```bash
python3 pipeline/registry.py
```

Archivia l'edizione corrente in `registry/issues/AAAA-MM.json` (se non esiste già: un'edizione archiviata
non viene mai riscritta) e ricalcola `webdata/registry.json`, letto dalla pagina `/registry`. Ogni file
ha il suo SHA-256 in `registry/index.json`; `python3 pipeline/registry.py --check` fallisce se un'edizione
è stata toccata. La prova della data è la cronologia di git del file.

Quando la finestra di sei mesi si chiude, l'edizione viene confrontata con i golpe registrati: Brier,
skill rispetto al tasso di base, AUC, eventi nel 10% più alto. Finché nessuna finestra è chiusa la
pagina mostra, separata e dichiarata come tale, una ricostruzione dalle previsioni fuori campione della
validazione: non sono previsioni fatte in anticipo.

## Aggiornamento automatico

`.github/workflows/monthly-forecast.yml` gira il 6 di ogni mese (e a mano da *Actions → Run workflow*):
riscarica tutte le fonti, riaddestra, archivia l'edizione, valuta quelle chiuse, verifica che il sito
compili e fa il push; Vercel pubblica dal push. Servono due *secrets* del repository: `ACLED_EMAIL` e
`ACLED_PASSWORD`. I dati grezzi ACLED vengono riscaricati a ogni esecuzione e non finiscono né nella
cache né nel repository.

## Segnali di innesco (sperimentale)

```bash
python3 pipeline/fetch_acled_text.py
```

```bash
python3 pipeline/fetch_elections.py
```

```bash
python3 pipeline/experiment_triggers.py
```

Il primo scarica il testo degli eventi ACLED rilevanti, il secondo il calendario elettorale da Wikipedia,
il terzo misura fuori campione se i precursori codificati in `pipeline/triggers.py` aggiungono qualcosa
al modello. Il modello pubblicato non cambia finché l'esperimento non lo giustifica: vedi `docs/triggers.md`.

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
| `/api/atlas` | rischio trimestrale per paese dal 1975 (vista Temporal Atlas) |
| `/api/registry` | edizioni archiviate, esiti e punteggi |

Le API leggono i file in `webdata/` attraverso `lib/data.js`, unico punto da cambiare se i dati
passano a un database.

## Deploy su Vercel

Importa il repository su Vercel: riconosce Next.js da solo, senza configurazione. L'aggiornamento mensile
è automatico (vedi sopra); a mano basta rieseguire la pipeline e caricare `webdata/`, `data/coupdb/` e `registry/`.

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
