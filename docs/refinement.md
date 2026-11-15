# Affinamento del modello e scheda paese

## Decisione

La combinazione pubblicata resta la media dei log-odds di logistica, gradient boosting e foresta
casuale (dall'edizione 2026-12 si aggiunge LightGBM come quarto componente, vedi `docs/extensions.md`;
le prove qui sotto riguardano l'insieme a tre componenti), con calibrazione di Platt sul passato.
Le alternative provate non danno miglioramenti
coerenti: pesi appresi sugli ultimi 20 anni di previsioni fuori campione, calibrazione mobile
regolarizzata, media aritmetica con calibrazione mobile. Il confronto è esplorativo e retrospettivo:
non è un test indipendente mai consultato, né una prova di accuratezza futura.

Per riprodurre: `python pipeline/run.py --boot 30 --no-archive`, poi
`python pipeline/experiment_refinement.py`. I numeri completi sono salvati in
`data/experiments/refinement.json`. Ogni anno usa soltanto esiti maturati prima di gennaio;
le finestre target sovrapposte all'anno di test vengono escluse. I pesi sperimentali sono limitati,
regolarizzati verso la media e ritornano alla media se il campione o l'ottimizzazione non bastano.

## Correzioni adottate

- La cache della validazione dipende dall'intera matrice, dall'indice, dal target, dai parametri
  degli stimatori, dall'orizzonte e dalle versioni delle librerie. Sostituisce il controllo basato
  sulla lunghezza e sulle somme di appena due variabili, che poteva riutilizzare risultati obsoleti.
- La calibrazione gestisce serie vuote, campioni insufficienti e una sola classe. Una pendenza
  non positiva non può invertire l'ordinamento del rischio.
- Gli intervalli usano la stessa foresta da 200 alberi del modello puntuale; prima i ricampionamenti
  ne usavano 80. Restano intervalli percentili all'80%, condizionati alla calibrazione: non includono
  l'incertezza sulle revisioni delle fonti o sulla scelta del modello. Trenta repliche restano una
  stima approssimativa delle code; servono più repliche per stabilizzarle ulteriormente.
- La variazione a tre mesi confronta le due righe con lo stesso modello corrente. È un confronto
  retrospettivo degli input, non una revisione della previsione archiviata tre mesi prima.
- Le spiegazioni seguono i nomi effettivi restituiti dall'imputazione anche quando una variabile
  è interamente mancante; non vengono attribuiti coefficienti alla colonna sbagliata.
- Le metriche della fascia più rischiosa ripartiscono i pari merito in modo frazionario al limite
  del 10% (arrotondato al paese successivo). Precisione e lift affiancano il richiamo; gli intervalli
  delle differenze includono anche il Brier. Il confronto con il tasso storico usa solo il passato.
- Le probabilità positive molto piccole non vengono più arrotondate a uno zero apparente:
  l'interfaccia aumenta la precisione o mostra una soglia (per esempio `<0.01%`).

## Scheda paese

La pagina e l'API condividono un calcolo deterministico: posizione regionale, mediana degli altri
paesi, percentile nella propria serie, picco datato, attività ACLED nei tre mesi recenti rispetto
ai 24 precedenti. I valori mancanti restano distinti dagli zeri; una base nulla non genera rapporti
infiniti. Il confronto regionale esclude il paese selezionato e gli stati storici.

La pipeline esporta 16 indicatori leggibili con scala, fonte e anno di riferimento, conteggi degli
input disponibili per gruppo, classificazione del regime e probabilità grezze dei componenti dell'insieme.
Gli indici annuali rispettano ritardi **assunti** di disponibilità: non disponiamo di tutte le
versioni storiche delle fonti. Gli indicatori economici descrivono gli input trasformati del modello;
eventuali limiti e valori portati avanti sono dichiarati, non presentati come osservazioni nuove.

I dati alimentano anche il contesto della console e il dossier PDF. L'archivio rende visibili
classificazioni contestate e possibili duplicati, esclusi per impostazione predefinita. La
selezione di un paese da confrontare annulla la richiesta precedente e comunica gli errori.

## Verifica

`python -m unittest discover -s pipeline -p 'test_*.py'`

`node --test tests/country-analysis.test.mjs tests/markets.test.mjs`

`npm run build`

I test verificano isolamento temporale, separazione delle finestre target, invalidazione della
cache, classi rare, spiegazioni con colonne mancanti, pari merito, date con buchi nelle serie,
confronti regionali e basi nulle. Il registro pubblico rimane immutabile: le verifiche locali usano
`--no-archive` e non creano una nuova previsione retrodatata.

Riferimenti tecnici: [calibrazione scikit-learn](https://scikit-learn.org/stable/modules/calibration.html),
[ottimizzazione vincolata SciPy](https://docs.scipy.org/doc/scipy/reference/optimize.minimize-slsqp.html).
