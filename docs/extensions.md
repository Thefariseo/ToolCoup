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
Polymarket e Kalshi, letti da endpoint pubblici (nessuna chiave per leggere). Manifold e' stato tolto: tratta moneta virtuale e i suoi prezzi non sono un segnale affidabile. I mercati sono mostrati **accanto** al modello e mai fusi con esso,
con la probabilita' del modello riportata sull'orizzonte di ciascun mercato (rischio costante fino a sei mesi, poi la struttura a termine della sezione 8).

Polymarket e Kalshi sono piattaforme a denaro reale e dalla rete italiana risultano **bloccati dall'ADM** (il certificato restituito e' quello della pagina di blocco
`sito-inibito-giochi.adm.gov.it`): per questo il codice non si puo' provare in locale contro di loro. Le richieste partono dal server su Vercel, che non
e' dietro quel blocco; la risposta di `/api/markets/<paese>` riporta per ogni fonte `ok` o l'errore, ed e' li' che va verificato dopo il deploy. Per prudenza i loro
mercati compaiono come dato con attribuzione e senza link (la promozione del gioco e' limitata in Italia).
Correzioni di questa versione. Kalshi: il prezzo e' il punto medio di bid e ask solo quando lo spread e' stretto (entro 15 centesimi), altrimenti l'ultimo scambio
(prima un libro con bid 0,01 e ask 1,00 dava un falso 50,5%); il volume si legge da `volume_fp` e si porta in dollari al prezzo corrente (prima arrivava sempre vuoto, quindi
Kalshi non poteva mai essere il mercato principale); la scansione degli eventi ha ora 38 secondi invece di 20 (si fermava a 92 pagine). Polymarket: tre pagine per termine di ricerca.
Se una fonte non risponde (blocco ADM in locale, errore, limite di richieste) il sito mostra l'ultima lettura buona, datata, da `webdata/markets-snapshot.json`; la risposta
dell'API riporta `fallback: "snapshot"` e `blocked: true` per quella fonte. Per rigenerare la copia: `node scripts/snapshot-markets.mjs https://<indirizzo del sito>`.

Dietro un blocco di rete (in Italia l'ADM serve la propria pagina al posto di Polymarket e Kalshi, anche se si interrogano resolver pubblici su UDP) il server, dopo il primo
errore col certificato del blocco, risolve gli indirizzi con DNS cifrato (Cloudflare, DoH) e contatta direttamente i server veri; dove la rete non blocca (Vercel) questo non scatta mai.
`MARKETS_NO_DOH=1` lo spegne. Kalshi limita le richieste: pausa tra le pagine e nuovi tentativi su 429.

## 5. Analogie strutturali (`pipeline/analogs.py`)
Per ogni paese, i 30 mesi storici piu' simili (distanza su variabili standardizzate di storia golpista, regime, leader, economia, contagio) e la quota seguita da un tentativo.

## 6. Monitor del discorso pubblico (`lib/discourse.js`)
Letture di Wikipedia (visite giornaliere) e di GDELT (volume e tono delle notizie) rispetto agli ultimi tre mesi. X non offre accesso gratuito al suo discorso,
quindi non viene letto. Sono allarmi descrittivi, non input del modello. GDELT DOC limita le richieste: a volte non risponde.


## 7. Quinto membro dell'insieme: la storia golpista (edizione 2026-12)

Il modello con tutte le variabili non batte in modo chiaro un modello piccolo, una regressione logistica su 14 variabili (storia golpista del paese, contagio, tendenza) che non usa ACLED.
Nella validazione fuori campione la sola storia ha un AUC di 0,79–0,80 e un Brier skill simile a quello dell'insieme; dal 2015 storia e contagio da soli stanno sopra l'insieme (AUC 0.840 contro 0.833,
nel 10% piu' alto 50% contro 47% dei tentativi). Le variabili in piu' e gli alberi aggiungono circa 0,02 di AUC e quasi nulla in Brier skill.
Quindi si e' provato a mettere questo modello come **quinto membro, con lo stesso peso degli altri** (media dei log-odds, calibrazione di Platt come prima). Un solo candidato, definito prima del test, senza pesi da scegliere.

Validazione anno per anno dal 1975 (modelli addestrati sul passato; `model.ENSEMBLE` contro `model.ENSEMBLE_FOUR`). Intervalli al 90% da ricampionamento dei paesi; la differenza e' *quinto membro meno quattro*.

| Finestra | Insieme a 4 | + storia (5) | Solo storia | Differenza AUC [90%] | Differenza AUC-PR [90%] | P(AUC meglio) | Nel 10% piu' alto: 4 → 5 |
|---|---|---|---|---|---|---|---|
| dal 1983 (94.825 paese-mesi, 2071 tentativi) | AUC 0.826, Brier skill 0.041 | AUC 0.827, Brier skill 0.042 | AUC 0.801 | +0.001 [-0.001, +0.003] | +0.002 [-0.001, +0.004] | 0.73 | 40% → 42% |
| dal 2005 (50.068 paese-mesi, 742 tentativi) | AUC 0.836, Brier skill 0.033 | AUC 0.838, Brier skill 0.033 | AUC 0.816 | +0.002 [-0.000, +0.005] | +0.002 [-0.002, +0.007] | 0.92 | 47% → 49% |
| dal 2015 (29.035 paese-mesi, 365 tentativi) | AUC 0.833, Brier skill 0.027 | AUC 0.839, Brier skill 0.028 | AUC 0.840 | +0.006 [+0.002, +0.010] | +0.005 [-0.000, +0.012] | 0.99 | 48% → 52% |

Il guadagno e' piccolo e coerente: il segno e' favorevole in tutte e tre le finestre per AUC, AUC-PR e quota nel 10% piu' alto, e il Brier skill non peggiora (negli intervalli il Brier include lo zero). Con la regola gia' usata per LightGBM
(P(meglio) alto in modo coerente, nessuna finestra peggiore) il modello entra. **Non e' una prova di miglioramento nel futuro**: la finestra dal 2015 ha 365 tentativi, e il confronto e' retrospettivo. Il beneficio atteso
e' una riduzione della varianza, non nuova informazione. `model.ENSEMBLE_NOACLED` ha lo stesso quinto membro, perche' non usa ACLED.


## 8. Struttura a termine della probabilita' (`pipeline/terms.py`, `webdata/terms.json`)

I mercati chiudono a date qualsiasi. Finora la stima a sei mesi si riportava con un rischio mensile costante, `P(h) = 1 - (1 - p6)^(h/6)`. Si e' misurato se regge fuori campione: per ogni scadenza h (1, 2, 3, 4, 9, 12, 18, 24 mesi)
il bersaglio e' "almeno un tentativo nei prossimi h mesi", la stima e' la probabilita' a sei mesi dell'insieme calibrato *fuori campione*, e la correzione candidata e' `logit F_h = a_h + b_h · logit p6` con coefficienti stimati ogni anno sugli esiti noti prima di quell'anno.
Confronto con il rischio costante sul Brier, dal 1992, intervalli al 90% da ricampionamento dei paesi:

| Scadenza | Paese-mesi | Eventi | Brier, rischio costante | Brier, con correzione | Differenza [90%] | P(meglio) | Primo 2% per rischio: previsto (costante → corretto), osservato |
|---|---|---|---|---|---|---|---|
| 3 mesi | 77.956 | 735 | 0.00915 | 0.00915 | +0.004e-3 [+0.002, +0.006] | 0.0 | 8.4% → 8.4%, osservato 6.3% |
| 4 mesi | 77.711 | 963 | 0.01192 | 0.01192 | +0.004e-3 [+0.000, +0.009] | 0.04 | 11.0% → 10.9%, osservato 8.3% |
| 9 mesi | 76.486 | 1.987 | 0.02420 | 0.02416 | -0.033e-3 [-0.080, +0.021] | 0.86 | 23.0% → 21.0%, osservato 15.0% |
| 12 mesi | 75.751 | 2.552 | 0.03087 | 0.03076 | -0.112e-3 [-0.225, +0.004] | 0.94 | 29.3% → 25.6%, osservato 18.8% |
| 18 mesi | 74.281 | 3.585 | 0.04298 | 0.04260 | -0.404e-3 [-0.634, -0.187] | 1.0 | 40.5% → 32.9%, osservato 25.5% |
| 24 mesi | 72.816 | 4.522 | 0.05380 | 0.05312 | -0.654e-3 [-1.065, -0.230] | 1.0 | 49.9% → 39.6%, osservato 30.9% |

Fino a sei mesi il rischio costante regge (la correzione non lo migliora; a 3 e 4 mesi lo peggiora di un soffio), oltre sei mesi no: **i golpe si raggruppano**, quindi i paesi piu' a rischio guadagnano meno su un orizzonte lungo di quanto dica un rischio indipendente. A 24 mesi il rischio costante prevedeva
il 50% per il 2% dei paesi piu' a rischio e se ne verificava il 31%. Per questo si adotta la correzione per le scadenze in cui riduce il Brier con P(meglio) >= 0,8 (qui 9, 12, 18 e 24 mesi); a sei mesi la mappa e' l'identita'
(il numero pubblicato non cambia), le curve sono cumulative e mai decrescenti, e tra una scadenza e l'altra si interpola il rischio cumulato. `lib/market-pick.js` (`termCurve`, `modelAtHorizon(p6, mesi, terms)`) e `pipeline/terms.py` (`curve`)
implementano la stessa funzione, con gli stessi vettori di prova (`tests/markets.test.mjs`, `pipeline/test_terms.py`). Si ricalcola ogni mese dopo `run.py`.
