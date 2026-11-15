import Link from "next/link";
import Brand from "@/components/Brand";

const link = (href, label) => <Link href={href} data-scramble><span className="sx">{label}</span></Link>;

export default function SiteFooter({ generated }) {
  return (
    <footer className="site-foot">
      <div className="foot-brand">
        <Brand variant="tagline" height={64} label="Praevex, political instability intelligence" />
        <p>A monthly coup-risk forecast for every country, filed in public and scored against what happens.</p>
      </div>
      <nav aria-label="Footer">
        <div>
          <h2>Forecasts</h2>
          {link("/", "Forecast console")}{link("/world", "World map")}{link("/violence", "Violence outlook")}{link("/markets", "Markets")}
        </div>
        <div>
          <h2>Evidence</h2>
          {link("/registry", "Forecast registry")}{link("/metodo", "Method and validation")}{link("/api/registry", "Registry API")}
        </div>
      </nav>
      <p className="foot-note">
        Sources: ACLED, V-Dem, World Bank, Powell &amp; Thyne and other coup datasets. Updated once a month{generated ? `, last on ${generated}` : ""}.
        Probabilities are model estimates of risk; even the highest does not mean a coup will happen.
      </p>
    </footer>
  );
}
