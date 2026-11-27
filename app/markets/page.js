import MarketsTable from "@/components/MarketsTable";
import SiteFooter from "@/components/SiteFooter";
import { marketTop } from "@/lib/highlights";

export const metadata = {
  title: "Markets vs model",
  description: "Prediction-market prices on coups, next to our model's probability restated for each market's horizon.",
};

export default function MarketsPage() {
  return (
    <>
      <main id="top" className="page">
        <div className="wrap">
        <header className="page-head">
          <h1>Prediction markets, next to our model</h1>
          <div className="page-head__side">
            <p className="lede">Open coup markets, one per country: whichever of Polymarket and Kalshi has more volume, beside our chance restated for the market&rsquo;s closing date.</p>
          </div>
        </header>
        <MarketsTable initial={marketTop(40)} />
        <p className="note map-note">We never blend the two. A crowd and a model make different mistakes, so a large gap is the most useful thing here.</p>
        <section className="block prose" aria-labelledby="reading-h">
          <h2 id="reading-h">How to read the gaps</h2>
          <p><strong>Same question, roughly.</strong> A market asks whether something called a coup happens by a date. Our target is at least one confirmed attempt, successful or failed, in the window. Markets also count rumours, plots and looser events, so they usually price higher than our model. A market below the model is rarer and worth a look.</p>
          <p><strong>Volume is the confidence.</strong> A market with a few thousand dollars traded tells you little. For each country we show the coup market with the most volume, preferring one with at least $5,000 traded. Both venues trade real money.</p>
          <p><strong>Coverage is thin.</strong> Only countries that traders follow have a market, so a missing market says nothing about risk. Both venues are blocked in some countries, so we show their prices as data and do not link to them.</p>
          <p><strong>Restating our number.</strong> Our probability covers six months. For a market that closes in <em>n</em> months, up to six, we assume the same risk every month: 1 − (1 − p)<sup>n/6</sup>. Beyond six months we use a correction fitted on past forecasts, because coups come in clusters and the riskiest countries gain less over a long horizon than a constant risk says; out of sample it lowered the Brier score at 9, 12, 18 and 24 months.</p>
        </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
