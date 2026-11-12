# Osservatorio rischio golpe

Analisi storica dei colpi di stato e stima del rischio per paese a partire dagli eventi ACLED.
Pipeline in Python, sito statico in `site/` pronto per Vercel.

## 1. Scarica i dati

```bash
python3 pipeline/fetch_coups.py
```

Prende l'ultima versione del dataset Powell & Thyne dal sito di Jonathan Powell (non esiste un'API:
è un CSV pubblico con nome datato, che lo script individua da solo).

```bash
python3 pipeline/fetch_acled.py
```

Scarica gli eventi ACLED via API, un CSV per anno in `data/raw/acled/`. Chiede email e password
myACLED a terminale (oppure le legge da `ACLED_EMAIL` e `ACLED_PASSWORD`); la password non viene
salvata. Il token di rinnovo resta in `.acled_token.json`, escluso da git. Il primo scaricamento
completo (dal 1997) richiede diverse centinaia di chiamate; quelli successivi riscaricano solo gli
ultimi due anni. Opzioni: `--from 2018`, `--refresh`.

In alternativa puoi mettere a mano in `data/raw/acled/` i CSV dell'Export Tool di ACLED.

## 2. Esegui la pipeline

```bash
python3 pipeline/run.py
```

Scrive `site/data/forecast.json`. Opzioni: `--horizon 12` cambia l'orizzonte (default 6 mesi);
`--demo` usa dati sintetici (generabili con `python3 pipeline/make_demo_data.py`).

Se la pipeline segnala golpe in "paesi non trovati in ACLED", aggiungi il nome al dizionario
`ALIASES` in `pipeline/data.py`.

## 3. Guarda il sito in locale

```bash
python3 -m http.server 8765 --directory site
```

## 4. Deploy su Vercel

`vercel.json` pubblica la cartella `site/` senza build. Dalla radice del progetto: `vercel` (anteprima)
e poi `vercel --prod`. Per aggiornare le previsioni: nuovo export ACLED, riesegui la pipeline, nuovo deploy.

Prima di pubblicare controlla le condizioni d'uso di ACLED: richiedono l'attribuzione e limitano
la ridistribuzione dei dati. Il sito contiene solo conteggi mensili per paese, non gli eventi grezzi.

## Come funziona

- **Panel**: eventi ACLED aggregati per paese-mese (proteste e disordini, violenza armata, vittime,
  scontri tra forze statali, repressione delle proteste, arresti, violenza statale sui civili).
- **Target**: almeno un tentativo di golpe (riuscito o fallito, Powell & Thyne) nei successivi N mesi.
- **Modello**: regressione logistica su livelli a 12 mesi, accelerazioni a 3 mesi e storia golpista
  del paese e della regione. Gradient boosting e modello "solo storia" come confronto.
- **Validazione**: finestra espandibile anno per anno; le metriche sono tutte fuori campione.
