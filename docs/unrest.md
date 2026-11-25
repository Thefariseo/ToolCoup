# Disordine politico: ondate di proteste e escalation di violenza

Il modello dei golpe risponde a una domanda rara (circa sette tentativi l'anno nel mondo): anche dopo vent'anni di validazione il Brier skill e' di pochi punti e ogni confronto ha
intervalli larghi. Il disordine politico e' molto piu' frequente e si osserva ogni mese, quindi si puo' prevedere e **valutare** con piu' forza. Questo modulo prevede, per ogni paese, due eventi
nei prossimi tre mesi, definiti sui conteggi mensili ACLED del paese (`pipeline/unrest.py`, `webdata/unrest.json`, pagina `/unrest` e sezione nella pagina paese):

- **ondata di proteste**: la media mensile di proteste e disordini (Protests + Riots) dei prossimi 3 mesi e' almeno 1,5 volte la media dei 12 mesi appena trascorsi, e almeno 25 al mese;
- **escalation di violenza**: lo stesso per la violenza organizzata (Battles, Explosions/remote violence, Violence against civilians).

La soglia e' relativa al paese: un paese in crisi permanente non e' "in ondata" solo perche' ha molti eventi. Le soglie (1,5 volte, 25 al mese) sono state fissate guardando i tassi di base, non il punteggio: a
parita' di rapporto, soglie di 10, 15, 25 e 40 danno basi tra il 7% e il 3,5% per le proteste e tra il 3% e l'1,7% per la violenza.

## Metodo

Stessa disciplina del modello dei golpe: regressione logistica regolarizzata e LightGBM sulle stesse 46 variabili, media dei log-odds, calibrazione di Platt a finestra espandibile stimata solo sul passato
(dal quarto anno di prova: nei primi tre, 2019–2021, non c'e' abbastanza storia e si usa la media non calibrata), validazione anno per anno dal 2019 con modelli addestrati sui soli mesi il cui esito era noto prima di gennaio
(`model.walk_forward` con `first_year`), confronto con la persistenza con intervalli da ricampionamento dei paesi. L'intervallo all'80% di ogni paese viene da 20 riaddestramenti su paesi ricampionati: se ne tiene la dispersione in log-odds
e la si centra sulla stima del modello pieno (i quantili grezzi dei ricampionamenti lasciavano la stima sul bordo del proprio intervallo per i paesi piu' a rischio, perche' ogni ricampionamento vede circa il 63% dei paesi e tende a probabilita' meno estreme).
Le variabili guardano solo al passato di ogni mese:

| Gruppo | Variabili |
|---|---|
| Livello recente | livelli a 1, 3, 6, 12 e 24 mesi (logaritmo), rapporti ultimo trimestre/anno, trimestre/semestre e anno/biennio, deviazione standard a 6 mesi, quota di disordini |
| Ondate gia' viste | il paese e' in ondata adesso, ondate negli ultimi 24 mesi, mesi dall'ultima |
| Violenza | livelli e rapporti della violenza organizzata, vittime, ondate di violenza |
| Stato | quota di proteste represse, arresti, scontri tra forze statali, eventi strategici, stato contro civili |
| Vicini | ondate e livello di proteste nei 7 paesi piu' vicini (centroide), ondate nella regione e nel mondo (anche ritardate di tre mesi) |
| Struttura | democrazia (V-Dem), liberta' civili, popolazione, reddito, mortalita' infantile, anni di copertura |
| Stagione | mese (seno e coseno) |

La copertura ACLED si e' allargata fino al 2018 (l'Africa parte dal 1997): si usano solo mesi con almeno 12 mesi di serie, e la valutazione parte dal 2019, perche' un paese che entra nella copertura puo' sembrare in ondata solo perche' si
comincia a contarlo.

## Risultati fuori campione (dal 2019)

**Ondata di proteste**: 5.6% dei paese-mesi sono eventi; 19.334 paese-mesi valutati, 1.076 eventi.

| Modello | AUC | AUC-PR | Quota di eventi nel 10% piu' alto | Brier skill | Log loss |
|---|---|---|---|---|---|
| Ultimo trimestre contro l'anno (persistenza) | 0.647 | 0.121 | 25% | – | – |
| Regressione logistica | 0.808 | 0.191 | 35% | -0.005 | 0.1907 |
| LightGBM (calibrato) | 0.817 | 0.192 | 38% | 0.072 | 0.1781 |
| Insieme calibrato (pubblicato) | 0.829 | 0.217 | 39% | 0.088 | 0.1746 |

L'insieme contro la persistenza: ΔAUC +0.180 [+0.157; +0.204], ΔAUC-PR +0.096 [+0.078; +0.116] (intervalli al 90% da ricampionamento dei paesi). L'insieme contro il solo LightGBM: ΔAUC +0.012 [+0.004; +0.019], ΔAUC-PR +0.025 [+0.011; +0.042].

**Escalation di violenza**: 2.3% dei paese-mesi sono eventi; 19.334 paese-mesi valutati, 437 eventi.

| Modello | AUC | AUC-PR | Quota di eventi nel 10% piu' alto | Brier skill | Log loss |
|---|---|---|---|---|---|
| Ultimo trimestre contro l'anno (persistenza) | 0.734 | 0.123 | 46% | – | – |
| Regressione logistica | 0.896 | 0.231 | 60% | 0.079 | 0.0809 |
| LightGBM (calibrato) | 0.922 | 0.244 | 71% | 0.131 | 0.0735 |
| Insieme calibrato (pubblicato) | 0.921 | 0.276 | 68% | 0.155 | 0.0725 |

L'insieme contro la persistenza: ΔAUC +0.187 [+0.149; +0.221], ΔAUC-PR +0.149 [+0.114; +0.189] (intervalli al 90% da ricampionamento dei paesi). L'insieme contro il solo LightGBM: ΔAUC -0.001 [-0.008; +0.005], ΔAUC-PR +0.030 [+0.007; +0.049].

La storia in breve: la persistenza (un paese gia' sopra il suo anno) e' appena meglio del caso per le proteste e discreta per la violenza; i due modelli insieme vedono quello che la persistenza non puo' vedere (i vicini, i ritorni, la risposta dello Stato). Il Brier skill e' molto piu' alto di quello dei golpe (circa 0,09 e 0,15 contro 0,03), ma le probabilita' restano modeste: la parte
facile e' ordinare i paesi, quella difficile e' dire il quando. Per l'escalation di violenza il solo LightGBM e l'insieme sono alla pari sull'AUC; l'insieme tiene i migliori AUC-PR e Brier skill, ed e' per questo il modello pubblicato.

## Conteggi per periodo, per paese e provincia (`pipeline/cast.py --kind unrest`)

Lo stesso modello della violenza (un solo LightGBM per i sei orizzonti, addestrato su errore assoluto del logaritmo del rapporto con la media a 6 periodi, miscelato con la media e l'ultimo periodo, province riscalate al totale,
intervalli dal backtest) con bersagli diversi: proteste pacifiche, proteste con intervento delle forze dell'ordine (compreso l'uso eccessivo della forza), disordini, e il totale. Le variabili sono quelle di sempre, compresa
la violenza organizzata. `webdata/unrest_counts.json` ha la stessa forma di `violence.json`, e la pagina paese usa lo stesso componente.

Accuratezza sul totale di proteste e disordini per paese, backtest su 12 date (una ogni 4 periodi) con modelli addestrati solo sul passato. WAPE: errore assoluto totale diviso il totale osservato; WIS: Weighted Interval Score con intervalli al 50, 80 e 95% e la mediana
(un punteggio proprio che si avvicina al CRPS; minore e' meglio). I quantili dei residui di ogni data sono stimati sulle altre date.

| Orizzonte (periodi di 4 settimane) | WAPE: modello misto | media a 6 | ultimo periodo | WIS: modello misto | media a 6 | ultimo periodo | Copertura dell'intervallo all'80% |
|---|---|---|---|---|---|---|---|
| 1 | 0.312 | 0.339 | 0.348 | 12.2 | 12.9 | 13.4 | 80% |
| 2 | 0.338 | 0.357 | 0.394 | 13.4 | 13.9 | 15.6 | 79% |
| 3 | 0.341 | 0.350 | 0.397 | 15.0 | 15.1 | 16.9 | 78% |
| 4 | 0.350 | 0.360 | 0.412 | 14.0 | 14.2 | 16.2 | 81% |
| 5 | 0.358 | 0.371 | 0.417 | 13.9 | 14.3 | 16.1 | 79% |
| 6 | 0.356 | 0.372 | 0.431 | 14.7 | 14.9 | 17.8 | 79% |

A ogni orizzonte il modello misto fa meglio della media a 6 periodi (WAPE da 3 a 8% in meno, WIS da 1 a 5% in meno) e dell'ultimo periodo (WAPE da 10 a 17% in meno). Da 3–4 periodi in poi il solo LightGBM e' alla pari con la miscela: la miscela serve soprattutto nei primi periodi. L'intervallo all'80% copre tra il 78 e l'81% dei casi, cioe' regge.

## Esperimento: un Temporal Fusion Transformer batte LightGBM? (`pipeline/experiment_unrest.py`)

`pipeline/tft.py` e' un TFT compatto scritto per il caso (reti a porte, selezione delle variabili nel tempo, LSTM encoder-decoder, attenzione interpretabile con maschera causale, uscite a quantili e logit degli eventi, perdita
pinball piu' entropia incrociata), senza `pytorch-forecasting` o `darts` per non portare dipendenze in conflitto con quelle fissate. Si addestra con piu' semi sulla finestra passata, esattamente come gli altri modelli, e si confronta sulle due classificazioni
e, a 3 mesi, sui quantili 10/50/90 del conteggio contro LightGBM a quantili. **Regola di adozione**: entra nel flusso mensile solo se la media dei log-odds dell'insieme pubblicato e del TFT migliora l'insieme su entrambi gli
eventi in AUC-PR e in Brier (punto stimato) con P(meglio) ≥ 0,9. L'esito e' in `data/experiments/unrest.json`; per rifarlo: `pip install -r pipeline/requirements-experiments.txt` e `python pipeline/experiment_unrest.py`.

Esito, con 2 semi e 10 epoche per anno di prova, dal 2019:

- Quantili del conteggio a 3 mesi (perdita pinball sul logaritmo del rapporto con l'anno, minore e' meglio): TFT 0.1222, LightGBM a quantili 0.1078, linea di base 0.1306.

| Evento | Modello | AUC | AUC-PR | Brier skill | Log loss |
|---|---|---|---|---|---|
| Ondata di proteste | Regressione logistica | 0.808 | 0.191 | -0.005 | 0.1907 |
|  | LightGBM (calibrato) | 0.817 | 0.192 | 0.072 | 0.1781 |
|  | Insieme pubblicato | 0.829 | 0.217 | 0.088 | 0.1746 |
|  | TFT (calibrato) | 0.829 | 0.198 | 0.087 | 0.1736 |
|  | Insieme + TFT | 0.839 | 0.225 | 0.101 | 0.1706 |
| Escalation di violenza | Regressione logistica | 0.896 | 0.231 | 0.079 | 0.0809 |
|  | LightGBM (calibrato) | 0.922 | 0.244 | 0.131 | 0.0735 |
|  | Insieme pubblicato | 0.921 | 0.276 | 0.155 | 0.0725 |
|  | TFT (calibrato) | 0.902 | 0.229 | 0.131 | 0.0769 |
|  | Insieme + TFT | 0.919 | 0.278 | 0.160 | 0.0725 |

- Ondata di proteste, insieme + TFT contro insieme: ΔAUC +0.010 [+0.006; +0.014], ΔAUC-PR +0.008 [-0.003; +0.019], ΔBrier -0.682e-3, P(meglio) 1.00: supera la regola.
- Escalation di violenza, insieme + TFT contro insieme: ΔAUC -0.001 [-0.006; +0.003], ΔAUC-PR +0.002 [-0.022; +0.025], ΔBrier -0.099e-3, P(meglio) 0.31: non supera la regola.

**Decisione: il TFT non entra nel flusso mensile.** La regola chiede il miglioramento su entrambi gli eventi. L'ondata di proteste la supera: ΔAUC +0.010 [+0.006; +0.014], Brier skill da 0.088 a 0.101; l'AUC-PR sale di +0.008, ma con un intervallo che include lo zero [-0.003; +0.019]. L'escalation di violenza no: l'insieme con il TFT non migliora (ΔAUC -0.001, P(meglio) 0.31) e il solo TFT sta sotto il solo LightGBM (AUC 0.902 contro 0.922). Sui quantili del conteggio a 3 mesi il TFT e' peggiore di LightGBM in tutti gli anni di prova (pinball 0.1222 contro 0.1078), quindi per i conteggi non c'e' nulla da adottare.

Adottarlo solo per le proteste sarebbe una scelta fatta dopo aver visto i risultati, e costerebbe PyTorch nel job mensile (circa 200 MB di installazione e qualche minuto in piu', con un modello non deterministico). Resta il risultato piu' vicino a un guadagno da un modello profondo: si rifa' il test tra un anno, con la stessa regola, quando ci sono due anni di prova in piu'.

## Il disordine migliora il modello dei golpe?

Il modello dei golpe vede gia' i conteggi ACLED grezzi. Si chiede se aggiungere la *previsione* di disordine (ondata e escalation a tre mesi, entrambe fuori campione) migliora le probabilita' di golpe a sei mesi. Test (`pipeline/experiment_unrest_coup.py`): stacking con due soli parametri in piu' (ridge fisso, scelto prima di guardare i risultati) rispetto alla sola ricalibrazione; schema *forward* (anni di prova 2022–2026, addestramento sugli anni precedenti con esiti maturati) e, come limite superiore ottimistico, *leave-one-year-out* sul 2019–2026.

| Schema | Paese-mesi | Mesi con un tentativo | ΔBrier, e-3 (con meno senza) | ΔLog loss, e-3 | ΔAUC-PR | ΔAUC | P(Brier meglio) |
|---|---|---|---|---|---|---|---|
| Forward | 12.381 | 174 | +0.013 [-0.064; +0.091] | +0.66 | +0.002 | -0.013 | 0.46 |
| Leave-one-year-out | 18.602 | 280 | -0.015 [-0.084; +0.047] | +0.14 | +0.002 | -0.004 | 0.65 |

Nello schema forward l'AUC del modello dei golpe e' 0.861 e il Brier skill 0.038; con il disordine l'AUC scende a 0.849 e il Brier skill resta a 0.037. La perdita logaritmica peggiora (P(meglio) 0.22), e rimescolando i valori di disordine tra paesi dello stesso mese (100 volte) il peggioramento osservato e' piu' grande di tutti i casi nulli (p = 1.00): la lettura del disordine non aggiunge informazione utile a quella che il modello dei golpe ha gia' (ha gia' i conteggi ACLED). Il segno e' pero' stabile: il peso dell'escalation di violenza e' positivo in ogni anno (0.17–0.33 deviazioni standard), quello dell'ondata di proteste oscilla attorno a zero. **Decisione: non entra nel modello dei golpe.** Resta visibile accanto, nella pagina paese, come lettura separata.

## Limiti

- ACLED aggiunge e rivede eventi nelle settimane successive: gli ultimi mesi sono i meno completi, e i modelli sono addestrati sui conteggi finali, quindi la validazione e' un po' ottimistica per l'uso in tempo reale (vale anche per il modello dei golpe e per CAST).
- "Ondata" e' una definizione relativa: non dice quanto e' grave, ne' se l'ondata e' politica in senso stretto (ACLED conta tutte le proteste e i disordini).
- Un processo non rilevato da ACLED (censura, accesso limitato) non esiste per il modello. Ottomila eventi di Libia o Siria dicono piu' sulla copertura che sul regime.
- Il legame con i golpe non e' automatico: un'ondata non e' un colpo, e viceversa. Dove entrambe le letture sono alte il paese merita attenzione, ma non si somma una probabilita' all'altra.
- **Non costruito**: l'uscita irregolare del leader (colpo, morte in carica, dimissioni forzate) come terzo bersaglio. Non c'e' una fonte aperta aggiornata oltre il 2015 (Archigos finisce li') e i tentativi con Wikidata non hanno dato una serie affidabile;
  i colpi sono gia' coperti dal modello principale. I processi gaussiani non sono implementati: nella letteratura sulla previsione dei conflitti non c'e' evidenza che migliorino un buon LightGBM, e il TFT probabilistico copre gia' l'incertezza.
