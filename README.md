# Praevex

Political instability intelligence. Previsione mensile del rischio di colpo di stato per ogni paese.

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

## Marchio

I cinque file originali del logo stanno in `assets/brand/source/`. `python3 scripts/build-brand.py` ricava da quelli tutto
il resto: le versioni per fondo scuro e per carta in `public/brand/`, le icone del browser (`app/icon.png`,
`app/apple-icon.png`, `app/favicon.ico`) e l'immagine di anteprima dei link (`app/opengraph-image.png`, `app/twitter-image.png`).
Il componente `components/Brand.js` e' l'unico punto che disegna il logo nel sito; `lib/dossier-pdf.js` lo mette nell'intestazione
e a piede di ogni pagina del PDF. Gli originali sono raster: non vanno ridisegnati, solo ritagliati.

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

## Estensioni (documento completo: [docs/extensions.md](docs/extensions.md))

- **Violenza politica** (`pipeline/cast.py`, pagina `/violence`): previsione degli eventi di violenza organizzata per paese e provincia nei prossimi sei periodi di
  quattro settimane, con LightGBM Tweedie, riconciliazione gerarchica e intervalli. Metodo ripreso da ACLED CAST; non e' la previsione di ACLED.
- **Mercati di previsione** (`lib/markets.js`): Polymarket e Kalshi, in lettura, accanto al modello. Manifold (moneta virtuale) non viene letto.
- **Analogie strutturali** (`pipeline/analogs.py`) e **monitor del discorso pubblico** (`lib/discourse.js`: Wikipedia e GDELT).
- **Nuove fonti per il modello** (`pipeline/fetch_extensions.py`, `pipeline/extensions.py`, `pipeline/experiment_extensions.py`): forze armate, eta' del leader,
  stress economico mensile, esclusione etnica. Entrano nel modello pubblicato solo se l'esperimento fuori campione lo giustifica.

## Country brief PDF (tre pagine)

Il pulsante *Country brief · PDF* nella console chiama `/api/dossier/[paese]`: i numeri e i fatti vengono dal nostro
database (`lib/dossier.js`), i titoli di stampa da una lista fissa di testate (Reuters, AP, BBC, Al Jazeera,
Crisis Group, ReliefWeb ecc., ultimi 75 giorni, solo titoli, tre ricerche in parallelo per gruppo di testate), e l'API
OpenAI (solo il modello `gpt-5.6-luna`, fisso in `lib/dossier.js`) scrive il testo vincolato a quei due ingressi,
con il compito di incrociare modello e stampa (tabella *Model x media cross-check*, punti ciechi del modello, tre
spunti non ovvi). Il PDF è una nota di policy di tre pagine A4 impaginata in `lib/dossier-pdf.js` (caratteri IBM Plex
in `assets/fonts`, bandiera da `public/flags/png`); ogni riquadro è misurato e la scala del testo si riduce finché la
pagina sta nei limiti. In sviluppo, `?mock=1` genera il PDF con un testo finto, senza spendere crediti.

Variabili d'ambiente (mai nel repository: `.env*` è ignorato da git):

| Variabile | Uso |
|---|---|
| `OPENAI_API_KEY` | obbligatoria, solo lato server. Senza, l'API risponde 503 |
| `DOSSIER_DISABLED=1` | spegne la funzione senza togliere la chiave |
| `ACLED_EMAIL`, `ACLED_PASSWORD` | solo per `pipeline/fetch_acled.py` in locale |

In locale metti le variabili in `.env.local`; in produzione vanno aggiunte nelle *Environment Variables* del
progetto Vercel. Ogni dossier costa una chiamata a pagamento: solo i paesi noti sono accettati, la risposta è
messa in cache dalla CDN per tutta l'edizione (la chiave di cache è `?issue=`), le richieste da altri siti sono
rifiutate e c'è un limite per IP e giornaliero per istanza (un freno, non una garanzia: imposta anche un tetto di
spesa mensile nel pannello OpenAI).

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

Affinamento, verifiche e scheda paese: [docs/refinement.md](docs/refinement.md).
Per ricalcolare localmente senza creare un'edizione nel registro: `python3 pipeline/run.py --boot 30 --no-archive`.
Per confrontare le alternative senza cambiare il modello pubblicato: `python3 pipeline/experiment_refinement.py`.

- **Campione**: paese-mesi dal 1950 a oggi (circa 160.000), non solo il periodo coperto da ACLED.
- **Target**: almeno un tentativo di golpe nei successivi N mesi, tra gli eventi confermati da almeno due
  fonti accademiche o presenti in Powell & Thyne.
- **Variabili** (`pipeline/panel.py`): storia golpista, contagio regionale e globale, regime, leader ed
  elezioni, economia, mobilitazione annuale, segnali mensili ACLED relativi alla norma del paese. Ogni
  variabile annuale rispetta un ritardo di pubblicazione assunto; non sono disponibili tutte le versioni storiche delle fonti.
- **Insieme** (`pipeline/model.py`): media di regressione logistica regolarizzata, gradient boosting e
  foresta casuale (dall'edizione 2026-12 anche LightGBM, `pipeline/lgbm.py`), poi calibrazione di Platt
  stimata solo sul passato. Le edizioni gia' archiviate nel registro non cambiano.
- **Validazione**: finestra espandibile anno per anno dal 1975; AUC-ROC, AUC-PR, Brier, calibrazione per
  fasce, confronti per sottrazione con intervalli da ricampionamento dei paesi.
- **Incertezza**: intervallo all'80% per ogni paese, da riaddestramenti su paesi ricampionati.

## Ticker, mercati, dossier per lettore e database dei golpe

- **Ticker** (`components/Ticker.js`, `lib/ticker.js`, `/api/ticker`): una riga sottile in fondo a ogni pagina con titoli su golpe, giunte e instabilita'
  dalle testate controllate di `lib/outlets.js` (Google News RSS, una ricerca per testata, ultimi 14 giorni) mescolati a righe dei nostri dati (maggiori
  variazioni di rischio, violenza prevista, registro, mercati). Ogni titolo e' legato a un paese e mostra la nostra stima. Si ferma con il mouse, il fuoco
  o il pulsante; con `prefers-reduced-motion` non scorre.
- **Mercati di previsione** (`lib/markets.js`): per ogni paese si guida con un solo mercato, quello con piu' volume tra Polymarket e Kalshi (soglia 5.000 $);
  Manifold, che usa denaro finto, non e' una fonte. Compaiono nella console (blocco *Market check*), in testa alla pagina paese, nella pagina
  `/markets`, nel ticker e nel dossier. Polymarket e Kalshi senza link in uscita. Kalshi si scorre in due passate (titoli, poi i mercati degli eventi pertinenti)
  e lo stato dell'API riporta `scan` (pagine, eventi, se il tempo e' finito).
- **Dossier per lettore** (`lib/dossier-profile.js`): un profilo calcolato con regole sui nostri dati (archetipo del paese, segnali con livello d'allarme,
  casi storici piu' simili) fa da cornice al testo; `?lens=analyst|investor|policy|newsroom|aid` cambia l'enfasi per il lettore. La console ha un selettore.
- **Database dei golpe** (`pipeline/build_coupdb.py`): l'HRD di V-Dem (fine di regime) e PIPE (conteggio annuale) confermano ma non fondano un evento; un evento
  con la sola fonte HRD non entra (`data/coupdb/excluded_hrd_only.csv`). Una voce di Wikipedia che chiama l'evento golpe o tentativo basta per il livello A.
  Il bersaglio del registro e' versionato (`target_version`); per correggere la sola storia sul sito senza toccare le previsioni:
  `python pipeline/export_web.py --refresh-history`.
