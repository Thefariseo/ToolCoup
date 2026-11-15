# Database unificato dei colpi di stato, 1900–oggi

Generato da `pipeline/build_coupdb.py`. Non modificare a mano: le correzioni vanno nel codice.

## File

- `coups.csv` — un evento per riga.
- `attestations.csv` — una riga per ogni fonte che segnala l'evento, con la data e l'esito che quella fonte riporta.

## Colonne di `coups.csv`

| Colonna | Significato |
|---|---|
| `event_id` | codice paese (Correlates of War) + data |
| `country`, `ccode` | paese; gli stati storici confluiscono nel successore (URSS → Russia, Impero ottomano → Turchia…) |
| `date`, `date_precision` | data dalla fonte più autorevole; precisione `day`, `month` o `year` |
| `type` | `riuscito`, `fallito`, `complotto` |
| `confidence` | A, B, C, D (vedi sotto) |
| `scope` | `national`, oppure `subnational` per un evento locale (esclude dal livello A) |
| `n_scholarly`, `n_encyclopedic` | numero di fonti accademiche ed enciclopediche che lo codificano come golpe |
| `sources` | elenco delle fonti |
| `outcome_disputed` | le fonti non concordano sull'esito |
| `colpus_class` | se Colpus ha esaminato l'evento e non lo considera un golpe, il motivo |
| `self_coup` | autogolpe: chi è già al potere rovescia le istituzioni |
| `disputed` | esito discusso oppure scartato da Colpus |
| `possible_duplicate_of` | probabile doppione di un altro evento (stesso paese ed esito, date entro un mese, nessuna fonte in comune) |
| `match_ambiguous` | una segnalazione poteva essere abbinata a più eventi |
| `label` | titolo o descrizione da Wikidata/Wikipedia |

## Affidabilità

- **A** — confermato: elencato da Powell & Thyne, oppure codificato come golpe o tentativo da almeno due fonti accademiche che registrano eventi, oppure descritto come golpe o tentativo da Wikipedia o Wikidata. Per decisione del progetto una voce enciclopedica che chiama l'evento golpe basta: Wikidata lo dice per costruzione (l'elenco è estratto dalle classi «colpo di stato»), gli elenchi di Wikipedia lo dicono nel testo.
- **B** — una fonte accademica confermata da una fonte annuale (HRD, PIPE), oppure un evento elencato da Wikipedia che il testo non chiama golpe (crisi costituzionale, rivolta, offensiva).
- **C** — una fonte accademica da sola, oppure solo fonti annuali (PIPE, o HRD insieme a PIPE).
- **D** — solo complotti o presunti golpe, evento che Colpus giudica inesistente, evento locale (contea, stato federato: colonna `scope`).

**HRD e PIPE confermano, non fondano.** L'HRD di V-Dem registra la fine di un regime, con la data in cui il nuovo regime si insedia; PIPE il numero di golpe riusciti in un anno. Nessuno dei due descrive un evento. L'HRD codifica come «autogolpe» costituzioni, referendum e poteri d'emergenza: è così che comparivano gli Stati Uniti 1964 (Civil Rights Act), l'Italia 1923 (legge Acerbo) o l'Ungheria 2020. Un evento che ha come unica fonte l'HRD non entra nel database: gli 82 casi sono elencati in `excluded_hrd_only.csv`, con il codice assegnato dall'HRD. Quando l'HRD ha un riscontro in una fonte che registra eventi, resta come conferma.

Il modello di previsione e il registro usano gli eventi di livello A più tutti quelli di Powell & Thyne, purché datati almeno al mese: un evento con la sola data dell'anno resta nella storia ma non si può collocare nella finestra di previsione giusta. I grafici storici del sito usano di default A–C, con un filtro per restringere o allargare. Il bersaglio del registro è versionato (`target_version`): le edizioni fino al 2026-11 sono valutate con la prima definizione (due fonti accademiche o Powell & Thyne), quelle successive con la corrente.

## Fonti

| Fonte | Periodo | Come entra |
|---|---|---|
| Powell & Thyne (2011, aggiornato) | 1950–oggi | file degli autori |
| Colpus — Chin, Carter & Wright (2021) | 1946–2022 | file degli autori |
| Center for Systemic Peace — Marshall & Marshall | 1946–2021 | file degli autori |
| Cline Center, Svolik, Singh, Luttwak, McGowan, Bjørnskov & Rode, Pérez-Liñán, Thompson, Fossum, Morrison, Be'eri | 1946–2020 | attraverso il confronto fatto da Colpus |
| Archigos 4.1 — Goemans, Gleditsch & Chiozza (2009) | 1875–2015 | capi di stato rimossi da militari o altri attori di governo |
| V-Dem, Historical Regimes Data — Knutsen, Djuve & Wig (2020) | 1789–oggi | regimi terminati da golpe militare, non militare o autogolpe, con data di fine. Solo conferma: da solo non crea un evento |
| PIPE — Przeworski et al. (2013) | 1788–2008 | numero di golpe riusciti per paese-anno (solo l'anno). Solo conferma di livello annuale |
| Wikidata | tutto | voci classificate come colpo di stato (licenza CC0) |
| Wikipedia in inglese, elenchi per paese e per anno | tutto | due elenchi, contati come una sola fonte (licenza CC BY-SA) |
| Wikipedia in francese, spagnolo e tedesco | tutto | un elenco per lingua, ciascuno contato come fonte a sé; date ed esiti esplicitati dagli estensori |

## Limiti noti

- **Prima del 1946** le fonti accademiche (Archigos, V-Dem, PIPE) registrano solo i golpe riusciti. I tentativi falliti vengono solo da fonti enciclopediche: sono sottostimati e mai sopra il livello C.
- **PIPE dà solo l'anno**: quando in un paese ci sono più golpe nello stesso anno, l'abbinamento all'evento giusto può essere sbagliato (`match_ambiguous`).
- **Calendari**: per paesi che usavano il calendario giuliano (Grecia, Russia, Balcani) alcune fonti riportano la data vecchio stile, 13 giorni prima. La tolleranza di 14 giorni ne recupera la maggior parte; i casi residui compaiono come possibili doppioni.
- **Dopo il 2022** restano Powell & Thyne e V-Dem tra le fonti accademiche; V-Dem registra solo i golpe riusciti che cambiano il regime.
- **Esito e paese delle voci enciclopediche** sono ricavati dal testo in modo automatico e possono essere sbagliati.
- **Definizioni diverse**: le fonti non intendono tutte la stessa cosa per "golpe" (autogolpe, ammutinamenti, complotti). Le colonne `colpus_class` e `self_coup` aiutano a distinguere.
- Mancano ancora: il file diretto del Cline Center (aggiornato al 2026) e Lehoucq e Pérez-Liñán per l'America Latina 1900–2006.
