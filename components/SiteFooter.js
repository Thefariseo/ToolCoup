import Link from "next/link";
import Brand from "@/components/Brand";

const link = (href, label) => <Link href={href} data-scramble><span className="sx">{label}</span></Link>;

export default function SiteFooter({ generated }) {
  return (
    <footer className="site-foot">
      <div className="foot-brand">
        <Brand variant="tagline" height={72} label="Praevex, political instability intelligence" lazy />
        <p>Each month we publish a coup-risk forecast for every country, keep it unchanged in public, and score it once its window closes.</p>
      </div>
      <nav aria-label="Footer">
        {link("/", "Forecast")}{link("/registry", "Registry")}{link("/violence", "Violence")}{link("/markets", "Markets")}{link("/world", "Map")}{link("/metodo", "Method")}{link("/api/registry", "Registry API")}
      </nav>
      <p className="foot-note">
        Sources: ACLED, V-Dem, World Bank, Powell &amp; Thyne and other coup datasets. The data refreshes once a month{generated ? `, last on ${generated}` : ""}.
        These are model estimates. Even the highest figure is far from a sure thing.
      </p>
    </footer>
  );
}
