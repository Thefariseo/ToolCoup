import WorldView from "@/components/WorldView";
import { getSummary, listCountries, queryCoups } from "@/lib/data";

export default function Home() {
  const { meta } = getSummary();
  const countries = listCountries();
  // primo caricamento: eventi al livello di affidabilita' predefinito, solo i campi usati dalla mappa
  const initialCoups = queryCoups({ conf: "C", types: ["riuscito", "fallito"] }).map(
    ({ id, slug, name, iso, date, prec, year, type, conf }) => ({ id, slug, name, iso, date, prec, year, type, conf })
  );
  return <WorldView countries={countries} meta={meta} initialCoups={initialCoups} />;
}
