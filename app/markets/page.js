import MarketsTable from "@/components/MarketsTable";
import Rise from "@/components/motion/Rise";
import SiteFooter from "@/components/SiteFooter";

export const metadata = {
  title: "Markets vs model",
  description: "Prediction-market prices on coups, next to our model's probability restated for each market's horizon.",
};

export default function MarketsPage() {
  return (
    <>
      <main className="wrap">
        <div className="page-head">
          <h1><Rise>Prediction markets, next to our model</Rise></h1>
          <p className="lede">Open prediction markets on coups, one per country: whichever of Polymarket and Kalshi has more volume. We restate our probability for each market&rsquo;s horizon so the two numbers can sit side by side. We never blend them. A crowd and a model make different mistakes, so a large gap is the most useful thing on this page.</p>
        </div>
        <MarketsTable />
        <section className="card prose">
          <h2>How to read it</h2>
          <p><strong>Same question, roughly.</strong> A market asks whether something called a coup happens by a date. Our target is at least one confirmed attempt, successful or failed, in the window. Markets also count rumours, plots and looser events, so they usually price higher than our model. A market below the model is rarer and worth a look.</p>
          <p><strong>Volume is the confidence.</strong> A market with a few thousand dollars traded tells you little. For each country we show the coup market with the most volume, preferring one with at least $5,000 traded. Both venues trade real money.</p>
          <p><strong>Coverage is thin.</strong> Only countries that traders follow have a market, so a missing market says nothing about risk. Both venues are blocked in some countries, so we show their prices as data and do not link to them.</p>
          <p><strong>Restating our number.</strong> Our probability covers six months. For a market that closes in <em>n</em> months we assume a constant hazard, 1 − (1 − p)<sup>n/6</sup>. It is an approximation, since coups come in clusters.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
