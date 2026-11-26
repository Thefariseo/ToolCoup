import Console from "@/components/console/Console";
import { watchlist } from "@/lib/console";
import { getSummary, traceModel } from "@/lib/data";
import { registrySummary } from "@/lib/registry";

export const metadata = {
  title: "Forecast console",
  description: "The watchlist, the globe, the history and the drivers behind each country's chance of a coup attempt in the next six months.",
};

export default function ForecastPage() {
  const { meta, metrics } = getSummary();
  const featureGroup = Object.fromEntries(traceModel().features.map((f) => [f.label, f.group]));
  const auc = metrics.find((m) => m.key === "ensemble")?.all?.auc;
  return <Console list={watchlist()} meta={meta} auc={auc} featureGroup={featureGroup} registry={registrySummary()} />;
}
