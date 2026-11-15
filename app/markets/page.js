import MarketsTable from "@/components/MarketsTable";
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
          <p className="eyebrow">MARKETS VS MODEL</p>
          <h1>What the crowd prices, next to our model</h1>
          <p className="lede">Open prediction markets on coups, one per country: of Polymarket and Kalshi, the one with the most volume traded. Our probability is restated for each market&rsquo;s horizon so the two numbers can be read side by side. They are never blended: an algorithm and a crowd make different mistakes, and a large gap is the most useful thing on this page.</p>
        </div>
        <MarketsTable />
        <section className="card prose">
          <h2>How to read it</h2>
          <p><strong>Same question, loosely.</strong> A market asks whether something called a coup will happen by a date; our target is at least one confirmed coup attempt, successful or failed, in the window. Markets often count rumours, plots and looser events, so they tend to sit above a model built on confirmed events. A market far below the model is rarer and more interesting.</p>
          <p><strong>Volume is the confidence.</strong> A market with a few thousand dollars traded says little. The leading market is the one with the most volume among the real-money venues, with a floor of $5,000; Manifold, which uses play money, appears only when neither of the others lists one.</p>
          <p><strong>Coverage is thin.</strong> Only countries that traders care about have a market. Absence says nothing about risk. Polymarket and Kalshi trade real money and are blocked in some countries, so they are shown as data, without links.</p>
          <p><strong>Restating our number.</strong> Our probability covers six months. For a market that closes in <em>n</em> months we assume a constant hazard: 1 − (1 − p)<sup>n/6</sup>. It is an approximation: coups cluster in time.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
