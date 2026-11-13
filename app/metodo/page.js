import { FactorBars, StudyChart } from "@/components/charts";
import { getSummary, getTimeline } from "@/lib/data";
import { dec, num, pct } from "@/lib/format";

export const metadata = { title: "Metodo" };

const MODELS = {
  logit: "Storia golpista + indicatori ACLED (modello pubblicato)",
  storia: "Solo storia golpista, senza ACLED",
  acled: "Solo indicatori ACLED, senza storia",
};
const STUDY = [["unrest", "Proteste e disordini"], ["violence", "Violenza armata"],
               ["fatalities", "Vittime"], ["infighting", "Scontri tra forze statali"]];

export default function Metodo() {
  const { meta, metrics, event_study: es, factors } = getSummary();
  const total = getTimeline("C").reduce((n, y) => n + y.success + y.failed, 0);
  const vals = STUDY.flatMap(([k]) => es.series[k]).filter((v) => v != null);
  const lo = Math.min(-0.2, ...vals), hi = Math.max(0.5, ...vals);
  return (
    <main className="wrap">
      <div className="page-head">
        <h1>Metodo e limiti</h1>
        <p className="lede">
          Da dove vengono i dati, come si costruisce la stima e quanto ci si può fidare. Aggiornato il {meta.generated},
          con eventi ACLED fino a {meta.data_end}.
        </p>
      </div>

      <section className="card prose">
        <h2>Il database dei colpi di stato</h2>
        <p style={{ marginTop: 8 }}>
          Nessuna fonte da sola è completa, quindi gli eventi vengono da un incrocio: Powell &amp; Thyne, Colpus, Center
          for Systemic Peace, Archigos, i dati storici sui regimi di V-Dem, PIPE, Wikidata e Wikipedia, più una decina
          di dataset che Colpus confronta tra loro. Le segnalazioni dello stesso paese con date compatibili diventano
          un unico evento. Dal 1900 risultano {num(total)} tentativi di livello A–C.
        </p>
        <ul>
          <li><strong>A</strong>: almeno due fonti accademiche indipendenti.</li>
          <li><strong>B</strong>: una fonte accademica, confermata da una enciclopedica.</li>
          <li><strong>C</strong>: una fonte accademica da sola, oppure due enciclopediche concordi.</li>
          <li><strong>D</strong>: una sola fonte enciclopedica, complotti e presunti golpe.</li>
        </ul>
        <p>
          <strong>Prima del 1946</strong> le fonti accademiche registrano solo i golpe riusciti: i tentativi falliti
          vengono da fonti enciclopediche e sono sottostimati. <strong>Dopo il 2022</strong> restano poche fonti
          accademiche aggiornate, quindi gli eventi recenti hanno spesso un livello più basso di quello che avranno.
        </p>
      </section>

      <section className="card">
        <h2>Quanto è affidabile la previsione</h2>
        <p className="note">
          Ogni anno dal {meta.first_test_year} è stato previsto con un modello addestrato solo sugli anni precedenti:
          {" "}{num(meta.n_oos)} paese-mesi, di cui {num(meta.n_oos_pos)} seguiti da un tentativo entro {meta.horizon} mesi.
        </p>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Modello</th><th className="num">AUC-ROC</th><th className="num">AUC-PR</th>
              <th className="num">Brier</th><th className="num">Golpe nel 10% più a rischio</th></tr></thead>
            <tbody>
              {Object.entries(metrics).map(([k, v]) => (
                <tr key={k}>
                  <td>{MODELS[k] || k}</td>
                  {v ? (<><td className="num">{dec(v.auc, 3)}</td><td className="num">{dec(v.pr_auc, 3)}</td>
                    <td className="num">{dec(v.brier, 4)}</td><td className="num">{pct(v.top10_recall, 0)}</td></>)
                     : <td colSpan={4}>non calcolabile</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          AUC-ROC: 0,5 equivale al caso, 1 è perfetto. AUC-PR va confrontata con il tasso base ({pct(meta.base_rate)}).
          La storia golpista spiega quasi tutta la capacità predittiva; gli indicatori ACLED aggiungono poco.
        </p>
      </section>

      <section className="card">
        <h2>Fattori di rischio nel modello</h2>
        <p className="note">Verso destra il rischio cresce, verso sinistra cala. Ogni fattore è misurato in deviazioni standard.</p>
        <div style={{ maxWidth: 620 }}><FactorBars factors={factors} /></div>
      </section>

      <section className="card">
        <h2>Cosa succede prima e dopo un golpe</h2>
        <p className="note">
          Media su {es.n} tentativi nel periodo coperto da ACLED, in deviazioni standard rispetto alla norma di ciascun paese.
        </p>
        <div className="small-multiples">
          {STUDY.map(([k, title]) => (
            <div key={k}>
              <p className="sm-title">{title}</p>
              <StudyChart offsets={es.offsets} values={es.series[k]} lo={lo} hi={hi} title={title} />
            </div>
          ))}
        </div>
      </section>

      <section className="card prose">
        <h2>Come si costruisce la stima</h2>
        <p style={{ marginTop: 8 }}>
          Una regressione logistica stima la probabilità che in un paese avvenga almeno un tentativo di golpe nei
          {" "}{meta.horizon} mesi successivi. Usa la storia golpista del paese e della regione e tre indicatori ACLED
          misurati rispetto alla norma del paese stesso: impennata di proteste e disordini, scontri recenti tra forze
          statali, quota di proteste represse. I conteggi assoluti non sono usati, perché crescono soprattutto con
          l&apos;estendersi della copertura ACLED. Come golpe da prevedere contano solo gli eventi confermati da
          almeno due fonti accademiche, più tutti quelli di Powell &amp; Thyne.
        </p>
        <p>
          <strong>Limiti.</strong> I golpe sono eventi rari: anche nei paesi più a rischio la probabilità resta bassa
          e l&apos;incertezza alta. Le stime indicano dove guardare, non cosa accadrà.
        </p>
        <p>
          <strong>Fonti.</strong> Eventi di conflitto e protesta: ACLED (acleddata.com). Golpe: Powell &amp; Thyne;
          Chin, Carter &amp; Wright (Colpus); Marshall &amp; Marshall (Center for Systemic Peace); Goemans, Gleditsch
          &amp; Chiozza (Archigos); Knutsen, Djuve &amp; Wig e V-Dem; Przeworski et al. (PIPE); Wikidata; Wikipedia.
        </p>
      </section>
    </main>
  );
}
