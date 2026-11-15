# Estensioni: nuove fonti, LightGBM, mercati, analogie, violenza

Questo documento descrive cosa e' stato aggiunto dopo il modello pubblicato e **come e' stato verificato**. Regola di fondo (gia' valida
per i segnali di innesco, `docs/triggers.md`): una variabile entra nel modello pubblicato solo se migliora la previsione fuori campione.
Le fonti che non lo fanno restano come contesto mostrato sul sito, dichiarate come tali.

## 1. Fonti aggiunte al pannello (`pipeline/fetch_extensions.py`, `pipeline/fetch_gdelt.py`, `pipeline/extensions.py`)

| Gruppo | Variabili | Fonte | Note |
|---|---|---|---|
| Forze armate | spesa militare % PIL e variazione a 3 anni, forze armate ogni 1000 abitanti, spesa per soldato, importazioni di armi pro capite | Banca Mondiale (dati SIPRI) | annuali, ritardo di un anno, ultimo valore riportato fino a 8 anni |
| Leader | eta' del capo | Archigos (fino al 2015), Wikidata (mese piu' recente) | la serie 2016-2026 manca: gli alberi gestiscono i mancanti |
| Stress economico | prezzi al consumo e alimentari (12 mesi), divario alimentare, deprezzamento e volatilita' del cambio, petrolio x dipendenza petrolifera, indice globale dei prezzi alimentari | FAOSTAT, FRED | mensili, ritardo di due mesi |
| Esclusione etnica | quota esclusa dal potere, quota dei gruppi dominanti, numero di gruppi esclusi | ETH Zurich EPR 2021 | categorie stabili, riportate oltre il 2021 |
| Sospensioni e sanzioni ONU | sospensione da UA/ECOWAS (in corso, nell'ultimo anno); inserimenti nella lista consolidata del Consiglio di sicurezza (cumulati) e regime attivo | `data/external/suspensions.csv`; lista consolidata ONU | vedi sotto |
| Forze straniere | personale delle missioni ONU (log), variazione a 12 mesi, ritiro (meno della meta in un anno); eventi ACLED con forze esterne | HDX / ONU DPO dal 2010; ACLED | il ritiro si legge come calo; non copre truppe non ONU se non attraverso ACLED |
| Limiti di mandato | tentativo di elusione l'anno scorso e negli ultimi cinque anni | Fails & Richardson, Harvard Dataverse (doi:10.7910/DVN/5NCYEO) | termina nel 2020: oltre e' sconosciuto |
| Stress sovrano (fondamentali) | riserve in mesi di importazioni, servizio del debito / export, saldo corrente, debito pubblico | Banca Mondiale | annuali; non sono spread di mercato |
| Notizie (GDELT) | volume, tono, quota di eventi di conflitto e di protesta, variazione a 6 mesi | file grezzi GDELT 1.0, un giorno su sette dal 2013-04 | campione, non conteggio esatto |

### Come sono stati risolti i tre vuoti
- **Sospensioni UA/ECOWAS.** Le voci datate degli articoli Wikipedia (che citano i comunicati) sono state trascritte in `data/external/suspensions.csv` con la revisione
  di riferimento. Sono incluse solo le sospensioni di cui l'articolo dichiara inizio e fine (o "tuttora sospeso"); le altre sono elencate nei commenti del file come da completare.
  21 periodi, 10 paesi. Si aggiorna a mano quando cambia l'articolo.
- **Sanzioni, forze straniere, limiti di mandato, spread.** Non esistono spread sovrani per paese in forma aperta (JP Morgan EMBI e i CDS sono commerciali): al loro posto
  ci sono i fondamentali del debito della Banca Mondiale. Sanzioni: la lista consolidata del Consiglio di sicurezza e' ufficiale e datata ma contiene solo i soggetti oggi
  inseriti (i regimi chiusi e le cancellazioni mancano, quindi il passato e' sottostimato); le sanzioni UE e USA non hanno una serie storica aperta (OpenSanctions pubblica solo
  lo stato attuale, CC BY-NC). Forze straniere: missioni ONU da HDX e attivita' di forze esterne da ACLED; non esiste un dataset aperto delle basi o dei ritiri militari bilaterali
  (Barkhane, Wagner). Limiti di mandato: il dataset di Fails & Richardson arriva al 2020, non esiste un aggiornamento aperto.
- **GDELT senza Google Cloud.** I file giornalieri di GDELT 1.0 sono pubblici: se ne scarica uno ogni sette giorni dal 2013 (circa 710 file, 8-12 MB l'uno), si aggregano
  per paese e si accumulano in `data/gdelt/daily_sample.csv`; il flusso mensile aggiunge solo i giorni nuovi.

`python pipeline/experiment_extensions.py` confronta, anno per anno dal 2005 e fuori campione, ogni gruppo contro la base, e il LightGBM contro l'insieme pubblicato.
L'esito va in `data/experiments/extensions.json` e decide cosa entra nell'edizione successiva.

## Risultati dell'esperimento (`data/experiments/extensions.json`)

Validazione anno per anno, modelli addestrati solo sul passato, dal 2005. Ogni riga confronta regressione logistica + LightGBM *con* il gruppo contro gli stessi due modelli *senza*. Intervalli al 90% da ricampionamento dei paesi; ΔAUC e ΔAUC-PR sono differenze (positivo = meglio con il gruppo); P(meglio) e' la quota di ricampionamenti in cui il gruppo migliora l'AUC.

**Finestra dal 2005**: 50.068 paese-mesi, 436 tentativi.

| Gruppo | ΔAUC [90%] | ΔAUC-PR [90%] | P(meglio) |
|---|---|---|---|
| Forze armate | -0.003 [-0.007, +0.001] | -0.003 [-0.010, +0.001] | 0.10 |
| Eta' del leader | -0.004 [-0.015, +0.008] | +0.008 [-0.000, +0.017] | 0.31 |
| Stress economico mensile | -0.015 [-0.036, -0.000] | -0.001 [-0.005, +0.004] | 0.04 |
| Esclusione etnica | -0.000 [-0.003, +0.002] | -0.001 [-0.003, +0.001] | 0.44 |
| Sospensioni UA/ECOWAS e sanzioni ONU | -0.008 [-0.020, +0.001] | -0.009 [-0.020, -0.001] | 0.08 |
| Forze straniere (missioni ONU, ACLED) | +0.002 [-0.003, +0.006] | +0.002 [-0.002, +0.006] | 0.69 |
| Limiti di mandato | -0.003 [-0.005, -0.000] | -0.001 [-0.005, +0.002] | 0.03 |
| Stress sovrano (fondamentali) | -0.002 [-0.007, +0.002] | -0.003 [-0.007, -0.000] | 0.22 |
| Tono delle notizie (GDELT) | -0.009 [-0.021, +0.002] | -0.007 [-0.017, +0.001] | 0.10 |
| Tutte insieme | -0.035 [-0.066, -0.003] | -0.010 [-0.023, +0.001] | 0.04 |

- Insieme pubblicato + LightGBM contro insieme pubblicato: ΔAUC +0.001 [-0.0, 0.003], ΔAUC-PR +0.002 [-0.001, 0.005], P(meglio) 0.85
- LightGBM contro HistGradientBoosting (scikit-learn): ΔAUC +0.007 [-0.0, 0.016], ΔAUC-PR -0.002 [-0.011, 0.007], P(meglio) 0.95
- Insieme pubblicato: AUC 0.862, Brier skill 0.025, tentativi nel 10% piu' alto 48.6%; con LightGBM: AUC 0.863, Brier skill 0.027, 50.2%.

**Finestra dal 2015 (tutte le fonti disponibili, GDELT compreso)**: 29.035 paese-mesi, 176 tentativi.

| Gruppo | ΔAUC [90%] | ΔAUC-PR [90%] | P(meglio) |
|---|---|---|---|
| Forze armate | +0.000 [-0.005, +0.007] | -0.002 [-0.006, +0.000] | 0.44 |
| Eta' del leader | -0.007 [-0.025, +0.005] | -0.003 [-0.008, +0.002] | 0.22 |
| Stress economico mensile | -0.029 [-0.076, +0.001] | -0.004 [-0.009, -0.000] | 0.08 |
| Esclusione etnica | -0.003 [-0.007, +0.001] | -0.001 [-0.003, +0.000] | 0.08 |
| Sospensioni UA/ECOWAS e sanzioni ONU | +0.002 [-0.001, +0.005] | +0.001 [-0.003, +0.004] | 0.87 |
| Forze straniere (missioni ONU, ACLED) | +0.003 [-0.009, +0.011] | +0.000 [-0.005, +0.004] | 0.72 |
| Limiti di mandato | -0.003 [-0.007, +0.000] | -0.001 [-0.005, +0.002] | 0.09 |
| Stress sovrano (fondamentali) | +0.004 [-0.002, +0.011] | -0.000 [-0.004, +0.003] | 0.85 |
| Tono delle notizie (GDELT) | -0.017 [-0.042, +0.006] | -0.004 [-0.012, +0.004] | 0.12 |
| Tutte insieme | -0.051 [-0.118, +0.005] | -0.005 [-0.015, +0.005] | 0.07 |

- Insieme pubblicato + LightGBM contro insieme pubblicato: ΔAUC +0.002 [-0.001, 0.005], ΔAUC-PR +0.001 [0.0, 0.003], P(meglio) 0.84
- LightGBM contro HistGradientBoosting (scikit-learn): ΔAUC +0.012 [0.001, 0.024], ΔAUC-PR +0.005 [0.001, 0.01], P(meglio) 0.96
- Insieme pubblicato: AUC 0.884, Brier skill 0.011, tentativi nel 10% piu' alto 47.2%; con LightGBM: AUC 0.886, Brier skill 0.013, 52.3%.

**Lettura.** Nessun gruppo di variabili migliora la previsione: gli intervalli includono lo zero o sono negativi, e le variabili aggiunte tutte insieme la peggiorano in modo evidente (rumore e sovra-adattamento). E' lo stesso esito dei segnali di innesco e del calendario elettorale (`docs/triggers.md`): il modello strutturale, la storia golpista e il regime dicono gia' quasi tutto quello che queste fonti sanno. Nove gruppi sono stati provati, quindi un singolo risultato appena positivo sarebbe comunque da prendere con prudenza. **Nessuna di queste variabili entra nel modello pubblicato**; restano come contesto descrittivo sulla pagina di ogni paese.

**LightGBM.** Come singolo modello batte `HistGradientBoostingClassifier` (AUC +0,012 con probabilita' 0,96 nel periodo 2015-2026, +0,007 con 0,95 dal 2005). Aggiunto come quarto membro dell'insieme migliora ogni misura in entrambe le finestre (AUC, AUC-PR, Brier skill, quota di tentativi nel 10% piu' alto) ma di poco e senza escludere lo zero (P(meglio) circa 0,85). **E' stato attivato comunque, per scelta del progetto, come quarto componente dell'insieme** (`SPECS` e `ENSEMBLE` in `pipeline/model.py`, costruttore in `pipeline/lgbm.py`), a partire dalla prima edizione mensile successiva (2026-12): il numero pubblicato nel registro cambia da quell'edizione, le precedenti restano com'erano. Per non nascondere il cambio, `run.py` calcola a ogni edizione anche l'insieme a tre componenti e la pagina Method mostra il confronto con e senza LightGBM; ogni nuova edizione del registro riporta versione del modello e componenti.

## 2. LightGBM
`make_lgbm()` in `pipeline/lgbm.py`: 250 alberi, 8 foglie, tasso 0,03, sottocampionamento, valori mancanti gestiti nativamente, `deterministic` e `force_row_wise` per avere lo stesso risultato con qualunque numero di thread. Quarto componente dell'insieme dall'edizione 2026-12 (vedi sopra: il miglioramento misurato e' piccolo e non distinguibile da zero).

## 3. Violenza politica (`pipeline/cast.py`)
Sistema di allerta sulla violenza sul modello della metodologia pubblicata da ACLED CAST. E' un nostro modello, non la previsione di ACLED.
Periodi di 28 giorni, sei orizzonti, province (admin1) > paese, tre tipi di evento piu' il totale.

**Versione 2 (novembre 2026).** Per ogni tipo e per il totale, a livello paese, **un solo LightGBM per tutti e sei gli orizzonti** (l'orizzonte e' una variabile),
con errore assoluto (L1) invece di Tweedie, addestrato sul logaritmo del rapporto tra i conteggi futuri e la media mobile a 6 periodi, con peso piu' alto alle osservazioni
recenti (emivita 40 periodi). Le tre scelte sono state misurate in `pipeline/experiment_cast.py` su 24 origini: la metrica pubblicata (WAPE, errore relativo) e' un errore
assoluto, che si minimizza con la mediana e non con la media; sei volte piu' righe per modello riducono la varianza ai lunghi orizzonti; il peso recente segue i cambi di regime
(Ucraina, Sudan, Sahel). 131 variabili a livello paese (ritardi, medie, pendenza, massimo, EWMA, quota degli attori, paesi vicini, totale mondiale, V-Dem, dati nazionali).

**Combinazione.** La previsione pubblicata e' una media pesata di modello, media a 6 periodi e ultimo periodo. I pesi, per orizzonte, si stimano (WAPE + errore relativo) soltanto
sulle origini del backtest il cui esito era gia' noto, con riduzione verso i pesi uguali: nessuna informazione dal futuro. Le province hanno un modello analogo per il totale,
poi ridimensionato perche' sommino al paese; i tipi sono ridimensionati al totale (piu' semplice della riconciliazione MinT di CAST: il totale paese e' piu' preciso della somma delle province).
Intervalli all'80%: residui del backtest a finestra mobile, scalati con sqrt(previsione + 1), quantili per tipo, orizzonte e classe di dimensione; la copertura e' misurata leave-one-origin-out.

**Risultati (24 origini a passo di due periodi, 244 paesi, totale organizzato).**

| Periodi avanti | WAPE miscela | WAPE media a 6 | WAPE ultimo | errore relativo miscela | errore relativo media a 6 | copertura 80% |
|---|---|---|---|---|---|---|
| 1 | 0,139 | 0,186 | 0,143 | 0,382 | 0,415 | 0,82 |
| 2 | 0,202 | 0,220 | 0,211 | 0,560 | 0,586 | 0,80 |
| 3 | 0,214 | 0,239 | 0,222 | 0,519 | 0,538 | 0,80 |
| 4 | 0,235 | 0,254 | 0,252 | 0,574 | 0,592 | 0,81 |
| 5 | 0,257 | 0,274 | 0,274 | 0,551 | 0,576 | 0,80 |
| 6 | 0,265 | 0,288 | 0,282 | 0,604 | 0,627 | 0,80 |

La miscela batte la media a 6 periodi a ogni orizzonte e su ogni misura: WAPE da -25% a un periodo a -6% a cinque, errore relativo da -8% a -3%, RMSLE da -7% a -1%.
Rispetto alla versione 1 (media semplice di modello Tweedie, media a 6 periodi e ultimo periodo; `old_mix` in `experiment_cast.py`, stesse 24 origini e stessi paesi) il guadagno
e' reale ma **modesto**: WAPE da -3% a -9% (media -6%), errore relativo da -1% a -3% (media -2%), RMSLE circa -2%.
**Cosa non e' risolto:** oltre i due periodi il margine sulla persistenza e' piccolo, perche' gran parte dell'errore (escalation improvvise, copertura delle fonti) non si prevede dai conteggi passati; con 24
origini sovrapposte (orizzonte fino a sei periodi) i numeri hanno una soglia di rumore di diversi punti percentuali, quindi i guadagni sulla versione 1 vanno letti come indicativi. `pipeline/cast.py --reuse` riusa il backtest salvato.

Per questo `fetch_acled.py` scarica ora anche `admin1` e le coordinate. Mancano le variabili subnazionali WorldPop e CIESIN. Attenzione: l'API ACLED restituisce le etichette degli
attori in testo ("State forces", "External/Other forces"), non i codici 1-8: i confronti numerici darebbero zero senza avvisare.

## 4. Mercati di previsione (`lib/markets.js`)
Polymarket, Kalshi e Manifold, letti da endpoint pubblici (nessuna chiave per leggere). I mercati sono mostrati **accanto** al modello e mai fusi con esso,
con la probabilita' del modello riportata sull'orizzonte di ciascun mercato (rischio costante).

Polymarket e Kalshi sono piattaforme a denaro reale e dalla rete italiana risultano **bloccati dall'ADM** (il certificato restituito e' quello della pagina di blocco
`sito-inibito-giochi.adm.gov.it`): per questo il codice non e' stato provato contro di loro, ma solo contro Manifold. Le richieste partono dal server su Vercel, che non
e' dietro quel blocco; la risposta di `/api/markets/<paese>` riporta per ogni fonte `ok` o l'errore, ed e' li' che va verificato dopo il deploy. Per prudenza i loro
mercati compaiono come dato con attribuzione e senza link (la promozione del gioco e' limitata in Italia); Manifold, a moneta virtuale, e' linkato.
## 5. Analogie strutturali (`pipeline/analogs.py`)
Per ogni paese, i 30 mesi storici piu' simili (distanza su variabili standardizzate di storia golpista, regime, leader, economia, contagio) e la quota seguita da un tentativo.

## 6. Monitor del discorso pubblico (`lib/discourse.js`)
Letture di Wikipedia (visite giornaliere) e di GDELT (volume e tono delle notizie) rispetto agli ultimi tre mesi. X non offre accesso gratuito al suo discorso,
quindi non viene letto. Sono allarmi descrittivi, non input del modello. GDELT DOC limita le richieste: a volte non risponde.

