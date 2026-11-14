# Segnali di innesco: esito dell'esperimento

**Esito (14 novembre 2026): i segnali non migliorano la previsione. Non entrano nel modello pubblicato.**

## Cosa è stato provato

- **Testo ACLED.** 288.884 eventi con il campo descrittivo, 1997 → novembre 2026, 234 paesi: tutti gli
  "Strategic developments" più gli eventi di qualunque tipo che citano *coup*, *mutin*, *overthrow* o hanno
  un attore "Mutiny of …" (`pipeline/fetch_acled_text.py`).
- **Codifica.** Sette categorie riconosciute con espressioni regolari (`pipeline/triggers.py`):

  | Categoria | Eventi | Paesi |
  |---|---:|---:|
  | complotti e golpe sventati | 1.979 | 90 |
  | ammutinamenti | 1.284 | 88 |
  | stato d'emergenza, parlamento sciolto | 1.161 | 104 |
  | arresti di militari | 1.113 | 111 |
  | voci e minacce di golpe | 286 | 47 |
  | crisi al vertice dello stato | 282 | 73 |
  | epurazioni ai vertici militari | 129 | 47 |

  Ogni variabile è la somma degli ultimi sei mesi (log), più il totale.
- **Calendario elettorale.** Elezioni nazionali 2010–2027 da Wikipedia (`pipeline/fetch_elections.py`):
  elezione nei sei mesi successivi e nei sei precedenti.

## Confronto fuori campione

Stesso insieme di modelli, stessi anni di prova (2008–2026, ogni anno previsto con modelli addestrati solo
sul passato), con e senza le nuove variabili. Intervalli al 90% da ricampionamento dei paesi.

| Aggiunta | Paese-mesi | Tentativi | AUC base | AUC con aggiunta | Differenza AUC | Differenza AUC-PR |
|---|---:|---:|---:|---:|---|---|
| segnali di innesco | 27.596 | 329 | 0,855 | 0,847 | −0,008 [−0,019, +0,002] | 0,000 [−0,008, +0,010] |
| calendario elettorale | 34.469 | 307 | 0,835 | 0,833 | −0,002 [−0,008, +0,003] | −0,001 [−0,007, +0,003] |
| entrambi | 27.596 | 329 | 0,855 | 0,844 | −0,011 [−0,022, −0,001] | −0,001 [−0,010, +0,008] |

Nessuna configurazione migliora; con entrambi il peggioramento dell'AUC esclude lo zero. Anche il Brier
skill scende (da 0,031 a 0,022 con i segnali).

## Perché

Presi da soli i segnali funzionano: nei sei mesi dopo un complotto sventato o un ammutinamento il tasso di
tentativi è circa tre volte quello degli altri paese-mesi (3,1% contro 1,1%). Ma accadono dove il modello
strutturale si aspetta già rischio alto. La colonna che conta è il rapporto tra tentativi osservati e
tentativi previsti dal modello base quando il segnale è acceso:

| Segnale acceso | Paese-mesi | Tasso osservato | Osservato / previsto dal modello base |
|---|---:|---:|---:|
| stato d'emergenza, parlamento sciolto | 1.651 | 2,7% | 1,39 |
| epurazioni ai vertici militari | 470 | 2,8% | 1,12 |
| ammutinamenti | 1.590 | 3,1% | 1,06 |
| elezione nei 6 mesi successivi | 3.335 | 1,0% | 1,04 |
| complotti e golpe sventati | 1.638 | 3,1% | 0,96 |
| arresti di militari | 2.507 | 1,8% | 0,79 |
| elezione nei 6 mesi precedenti | 3.296 | 0,8% | 0,77 |
| voci e minacce di golpe | 552 | 1,3% | 0,69 |
| crisi al vertice dello stato | 742 | 1,6% | 0,69 |

Un rapporto vicino a 1 significa che il segnale non dice nulla che la storia golpista e il tipo di regime
non dicessero già. Solo lo stato d'emergenza resta sopra (1,39), su 1.651 paese-mesi: troppo poco per
reggere da solo, ma è l'unica pista che merita un secondo giro.

## Limiti di questa prova

- Regole a parole chiave: "coup" compare spesso in anniversari e commemorazioni, e le note ACLED degli anni
  '90 sono brevissime. Una classificazione fatta leggendo il testo (un modello linguistico o una codifica a
  mano di un campione) potrebbe separare meglio i precursori veri.
- La copertura ACLED fuori dall'Africa parte tra il 2016 e il 2021: pochi tentativi osservati con il segnale
  disponibile.
- Il calendario elettorale del passato riporta le elezioni tenute, non quelle in programma: se c'è un
  vantaggio a posteriori, non è bastato.
- Le notizie di stampa non sono state provate.

Numeri completi in `data/experiments/triggers.json`; per rifare tutto: `python3 pipeline/experiment_triggers.py --from 2008`.
