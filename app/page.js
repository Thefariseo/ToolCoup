import Console from "@/components/console/Console";
import { watchlist } from "@/lib/console";
import { getSummary, traceModel } from "@/lib/data";
import { registrySummary } from "@/lib/registry";

export default function Home() {
  const { meta, metrics } = getSummary();
  const featureGroup = Object.fromEntries(traceModel().features.map((f) => [f.label, f.group]));
  const auc = metrics.find((m) => m.key === "ensemble")?.all?.auc;
  return <Console list={watchlist()} meta={meta} auc={auc} featureGroup={featureGroup} registry={registrySummary()} />;
}
