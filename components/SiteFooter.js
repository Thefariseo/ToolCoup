import Link from "next/link";

export default function SiteFooter({ generated }) {
  return (
    <footer className="site-foot">
      <div>
        <b>TOOLCOUP</b>
        <p>Country-level coup risk: a monthly forecast, filed in public and scored against what happens.</p>
      </div>
      <nav aria-label="Footer">
        <Link href="/">Console</Link><Link href="/registry">Forecast registry</Link><Link href="/world">Archive</Link><Link href="/metodo">Method &amp; validation</Link>
        <Link href="/api/registry">Registry API</Link>
      </nav>
      <p>
        Data: ACLED, V-Dem, World Bank, Powell &amp; Thyne and other coup datasets. A monthly snapshot, not a live feed{generated ? ` · exported ${generated}` : ""}.
        Probabilities are model estimates, not predictions that a coup will happen.
      </p>
    </footer>
  );
}
