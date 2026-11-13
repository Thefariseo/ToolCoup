import Instrument from "@/components/lab/Instrument";
import { getSummary, listCountries, traceModel } from "@/lib/data";

export default function Home() {
  const { meta } = getSummary();
  return <Instrument countries={listCountries()} meta={meta} model={traceModel()} />;
}
