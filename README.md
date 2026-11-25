# Praevex
<img width="1810" height="869" alt="praevexfinallogo" src="https://github.com/user-attachments/assets/5b3a1941-dd06-45dc-8548-7b82eacb849d" />

Political instability intelligence. Previsione mensile del rischio di colpo di stato per ogni paese.



Praevex is an open-source political instability intelligence instrument combining historical coup data, conflict signals, probabilistic forecasting, and interactive generative visualizations to explore how political risk evolves over time.

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

## Country brief PDF (copertina e tre pagine)

Il pulsante *Country brief · PDF* nella console chiama `/api/dossier/[paese]`: i numeri e i fatti vengono dal nostro
database (`lib/dossier.js`), i titoli di stampa da una lista fissa di testate (Reuters, AP, BBC, Al Jazeera,
Crisis Group, ReliefWeb ecc., ultimi 75 giorni, solo titoli, tre ricerche in parallelo per gruppo di testate), e l'API
OpenAI (solo il modello `gpt-6-luna`, fisso in `lib/dossier.js`) scrive il testo vincolato a quei due ingressi,
con il compito di incrociare modello e stampa (tabella *Model x media cross-check*, punti ciechi del modello, tre
spunti non ovvi). Il PDF è una nota di policy A4 di quattro pagine (copertina e tre pagine interne) impaginata in `lib/dossier-pdf.js` (caratteri IBM Plex
in `assets/fonts`, bandiera da `public/flags/png`); ogni riquadro è misurato e la scala del testo si riduce finché la
pagina sta nei limiti. In sviluppo, `?mock=1` genera il PDF con un testo finto, senza spendere crediti.
La copertina (`lib/dossier-cover.js`) e' bianca: logo verticale al centro, poi bandiera e sagoma del paese affiancate (solo il bordo nero, senza
vicini; da `world-atlas`, proiezione azimutale equivalente centrata sul paese), il nome e una riga di identificativi in basso. Nessun numero.

**Il testo del brief** e' scritto per il lettore scelto (analista, investitore, diplomatico, giornalista, operatore umanitario): `lib/dossier.js` da' a
`gpt-6-luna` una voce diversa per ciascuno (`PERSONAS`) e uno schema in cui ogni riga e' un'osservazione, non un'etichetta. Le testate non sono
"le notizie sul paese": `lib/press-plan.js` decide dai dati quali linee cercare (golpe e transizione, forze armate, elezioni e successione, piazza se le
proteste superano la media dei tre anni, violenza organizzata, economia, pressione regionale), con il motivo di ciascuna, e `lib/dossier-press.js` le
cerca solo nelle testate vagliate; un titolo conta solo se contiene una parola della sua linea e nessuna parola di sport o spettacolo. La pagina 3 ha la
tabella "cosa dicono i dati / cosa si riporta / cosa significa" e la sezione *Prediction markets* (Polymarket e Kalshi, ogni mercato su scala logaritmica
contro la nostra stima riportata allo stesso orizzonte, piu' una lettura scritta). La generazione usa un passaggio di ragionamento medio (circa due minuti,
rotta con `maxDuration` 300) e, se scade, uno rapido. In sviluppo: `?mock=1&json=facts|press` mostra cosa riceve lo scrittore, `?json=narrative` il testo senza PDF.

I conteggi dei golpe passano da `lib/coup-fix.js` (regola in `lib/coup-dedupe.js`): se un paese ha due voci nello stesso giorno, resta quella meglio attestata e l'altra
diventa doppione (Brasilia, 8 gennaio 2023, era sia "fallito" sia "riuscito"). Va tolto quando la pipeline li marchia da sola.

Il PDF e' composto di grafici disegnati direttamente (nessuna immagine): scheda di sintesi con un micro-grafico per cifra, posizione del paese tra tutti gli altri su scala
logaritmica, storia del rischio dal 1975 con ogni tentativo su un binario, registro dei tentativi dal 1900, il Model Trace in forma di ledger (dal paese di riferimento alla
previsione pubblicata, con la posizione del paese su ciascun gruppo), mercato di previsione contro modello, attivita' ACLED e previsione della violenza con fascia, e i segnali di
allerta come indicatori con le soglie. In sviluppo l'intestazione `X-Dossier-Scale` riporta di quanto ha dovuto ridursi il testo per pagina.

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
  foresta casuale (dall'edizione 2026-12 anche LightGBM, `pipeline/lgbm.py`, e una piccola logistica sulla sola storia golpista e il contagio),
  poi calibrazione di Platt stimata solo sul passato. Le edizioni gia' archiviate nel registro non cambiano.
- **Validazione**: finestra espandibile anno per anno dal 1975; AUC-ROC, AUC-PR, Brier, calibrazione per
  fasce, confronti per sottrazione con intervalli da ricampionamento dei paesi.
- **Incertezza**: intervallo all'80% per ogni paese, da riaddestramenti su paesi ricampionati.

## Disordine politico, struttura a termine e strato ibrido

Tre aggiunte al modello dei golpe, ciascuna provata fuori campione prima di entrare (risultati e regole di adozione nei documenti indicati).

- **Disordine politico** (`pipeline/unrest.py`, `pipeline/cast.py --kind unrest`, pagina `/unrest`, sezione nella pagina paese): la probabilita' di un'ondata di proteste e di
  un'escalation di violenza organizzata nei prossimi tre mesi, per ogni paese, e i conteggi di proteste e disordini per periodo di quattro settimane, per paese e provincia.
  Gli eventi sono frequenti, quindi si valutano molto meglio dei golpe. `pipeline/experiment_unrest.py` confronta LightGBM con un Temporal Fusion Transformer in casa
  (`pipeline/tft.py`, richiede `pipeline/requirements-experiments.txt`); il TFT entra nel flusso mensile solo se supera la regola di adozione, e per ora non la supera: migliora l'ondata di proteste (ΔAUC +0,010, Brier skill da 0,088 a 0,101) ma non l'escalation di violenza, e sui conteggi e' peggiore di LightGBM. Vedi `docs/unrest.md`.
  La lettura del disordine **non** entra nel modello dei golpe: `pipeline/experiment_unrest_coup.py` la prova come variabile aggiuntiva fuori campione e non migliora ne' il Brier ne' la perdita logaritmica (`data/experiments/unrest_coup.json`).
- **Struttura a termine** (`pipeline/terms.py`, `webdata/terms.json`): come si riporta la stima a sei mesi alla scadenza di un mercato. Rischio costante fino a sei mesi;
  oltre, una correzione stimata solo sul passato (i golpe si raggruppano). Il numero a sei mesi non cambia. Vedi `docs/extensions.md`, sezione 8.
- **Strato ibrido** (`lib/hybrid.js`, `lib/analyst.js`, `scripts/hybrid-snapshot.mjs`, `pipeline/hybrid_score.py`, `registry/hybrid/`): modello, mercati e un analista (modello linguistico
  che legge i titoli senza vedere la nostra stima) combinati in log-odds con pesi che seguono il loro registro, archiviati ogni mese e valutati quando la finestra si chiude. E'
  sperimentale e senza storia: non sostituisce la previsione. Per l'analista serve il segreto GitHub `OPENAI_API_KEY`. Vedi `docs/hybrid.md`.
- **Punteggi propri sui conteggi**: il modello della violenza riporta anche il Weighted Interval Score (approssima il CRPS) accanto a WAPE ed errore relativo.

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
