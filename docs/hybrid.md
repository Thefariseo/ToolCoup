# Lo strato ibrido: modello, mercati e analista

Non e' una previsione migliore di quella pubblicata: e' un esperimento **prospettico** che affianca il modello a due fonti diverse e vuole scoprire, con il tempo e
senza guardare al passato, se combinarle aiuta. Finche' nessuna finestra e' chiusa i pesi sono i prior e il sito lo dice (pagina `/registry#hybrid`).

## Da dove viene

Due lavori sulla previsione geopolitica ibrida (Benjamin et al., *Hybrid forecasting of geopolitical events*, AI Magazine 2023; Mellers, McCoy, Lu e Tetlock,
*Human and algorithmic predictions in geopolitical forecasting*, 2024) concordano su poche cose, e le abbiamo prese come regole:

1. **Un insieme semplice batte uno complesso, e i modelli proteggono dagli errori piu' gravi.** Nel torneo IARPA la combinazione di previsioni umane e di modelli
   (ARIMA piu' ETS, nulla di sofisticato) ha ridotto il Brier del 10% circa rispetto ai soli umani, e il guadagno veniva soprattutto dal rumore tolto.
2. **Si mediano i log-odds con pesi che seguono la bravura recente** (decadimento esponenziale, piu' peso a chi ha aggiornato con piccoli passi), e si
   *estremizza* l'aggregato solo quando le fonti hanno informazione diversa: con informazione molto sovrapposta estremizzare peggiora.
3. **Meglio la profondita' dell'ampiezza e mai dati cattivi**: pochi paesi, ben coperti, con fonti verificabili.

## Cosa si combina

Per ogni paese del registro ibrido (i paesi con un mercato utilizzabile piu' i 40 con la stima piu' alta) si archivia la lettura a sei mesi di:

- **modello**: la probabilita' pubblicata nell'edizione;
- **mercati**: i mercati sui golpe di Polymarket e Kalshi con almeno 5.000 $ scambiati, tra 1 e 24 mesi dalla chiusura, con prezzo tra 0,5% e 95%. Il prezzo di
  ciascuno si riporta a sei mesi con la nostra struttura a termine (`lib/market-pick.js`, `docs/extensions.md` sez. 8): si cerca la probabilita' a sei mesi che,
  riportata alla data del mercato, restituisce il prezzo. Piu' mercati sullo stesso paese si mediano in log-odds pesando per il volume;
- **analista**: un solo modello linguistico (`gpt-6-luna`, `lib/analyst.js`) a cui si danno la data, la finestra, una scheda del paese (regione, regime, ultimo
  tentativo, tentativi dal 2000, anni di potere del capo di stato), il tasso di base mondiale e i titoli trovati per angolo (gli stessi del dossier). **Non vede la
  nostra stima, ne' la posizione in classifica, ne' i fattori, ne' alcun prezzo di mercato**: se li vedesse li ripeterebbe e non aggiungerebbe nulla. Risponde con
  una probabilita' (0,1%–50%), la fiducia, una motivazione e i titoli che l'hanno spostato. La risposta grezza e' la **media in log-odds di tre risposte indipendenti** alla stessa domanda (`SAMPLES` in `lib/analyst.js`): una sola risposta e' troppo rumorosa, in due esecuzioni a un'ora di distanza lo stesso paese e' uscito a 18% e a 25% (e un altro a 8% e a 12%), e togliere rumore e' la parte del guadagno degli ibridi che resiste meglio. Le tre risposte sono archiviate (`analyst.samples`), la motivazione e' quella piu' vicina alla media. Poi la media si avvicina al tasso di base (si tiene meta' della distanza in
  log-odds) perche' i modelli linguistici gonfiano gli eventi rari.

## Come si combina (`lib/hybrid.js`)

```
z = somma_i w_i logit(p_i) / somma_i w_i                       i = modello, mercati, analista (quelli presenti)
p = expit( z0 + a (z - z0) ),   z0 = logit(tasso di base),   a = min(1,3; 1 + 0,1 (n - 1))
w_modello = 0,7 e^l_m    w_mercati = 0,2 e^l_k * liquidita'    w_analista = 0,1 e^l_a
liquidita' = clamp(radice(volume / 100.000), 0,25; 1)
```

L'estremizzazione parte dal **tasso di base**, non dal 50%: per un evento raro spingere una stima dell'1% lontano dal 50% la renderebbe solo piu' piccola. Con una
sola fonte non c'e' estremizzazione; con tre, il pool si allontana dal tasso di base del 20% in log-odds. L'indipendenza delle fonti e' un'ipotesi, non una misura: modello, mercati e
titoli di giornale si sovrappongono in parte, ed e' per questo che il passo e' piccolo (0,1 per fonte in piu', al massimo 1,3). Il registro dira' se serve di piu' o di meno; finche' non lo dice
il valore e' un prior dichiarato, non un risultato. I log-pesi `l_*` sono 0 finche' non ci sono edizioni chiuse.

## Archivio e punteggio

- `scripts/hybrid-snapshot.mjs` chiama `POST /api/hybrid/snapshot` (`app/api/hybrid/snapshot/route.js`), che esiste solo dove c'e' `HYBRID_SNAPSHOT=1`: il job mensile avvia
  il sito appena compilato sul runner con quella variabile e `OPENAI_API_KEY`; il sito pubblicato risponde 404. Scrive `registry/hybrid/AAAA-MM.json` (mai sovrascritto) e il
  suo SHA-256 in `registry/hybrid/index.json`. Il file contiene per ogni paese le tre letture, la combinazione, la motivazione dell'analista e i titoli che ha letto.
- `python pipeline/hybrid_score.py` (e `--check` per la sola integrita') legge i file, aspetta che la finestra di un'edizione si chiuda in `webdata/registry.json`, e per ogni
  fonte e per la combinazione calcola la perdita logaritmica e il Brier **sugli stessi paesi del modello**, cosi' un confronto non dipende da quali paesi hanno un mercato.
- **Regola di esclusione**: se un evento e' datato prima dell'istante dell'istantanea (l'istantanea del 2026-11 e' del 16 novembre, quella della previsione del 13) il paese esce dal
  punteggio di quell'edizione, perche' la lettura non era piu' una previsione.
- **Pesi** (Hedge, "esponenti"): ogni osservazione (paese, edizione chiusa) con almeno due fonti sposta il log-peso di ciascuna di `-0,5 · 0,9^eta' · (perdita - media delle fonti presenti)`;
  l'eta' e' in edizioni. Lo spostamento e' limitato a ±1,5 (un fattore 4,5 sul prior) e una fonte assente non viene penalizzata. Il modello e' il riferimento.

## Cosa non sappiamo, e quanto ci vorra'

- Non c'e' storia: i mercati sui golpe esistono da poco e il modello linguistico conosce gia' gran parte del passato, quindi un test all'indietro non vale. Si valuta in avanti.
  Con 7 o 8 tentativi l'anno nel mondo, e quasi tutti in paesi senza mercato, servono almeno due anni per dire qualcosa di solido, e per i mercati molto di piu'.
- Un mercato che prezza 6,5% un "tentativo di golpe" in Iran entro fine anno, contro lo 0,1% del modello, puo' misurare una definizione diversa (guerra, cambio di regime) e non un
  disaccordo sulla stessa domanda: i pesi lo scopriranno solo se l'evento accade. Le regole di risoluzione dei mercati non sono lette dal codice.
- L'analista costa: circa 130 chiamate al mese a `gpt-6-luna` con ragionamento basso (44 paesi per tre risposte; con `SAMPLES = 1` scendono a 44). Il segreto `OPENAI_API_KEY` va aggiunto al repository GitHub (Settings, Secrets and
  variables, Actions); senza, l'istantanea contiene solo modello e mercati e il passo non blocca il mese (`continue-on-error`).
- Per cambiare priori, passo di estremizzazione o soglie dei mercati si modifica `lib/hybrid.js` **prima** di una nuova edizione: le istantanee archiviate non cambiano.
