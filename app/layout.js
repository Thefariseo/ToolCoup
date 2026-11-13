
import Link from "next/link";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import CountrySearch from "@/components/CountrySearch";
import { getSummary, listCountries } from "@/lib/data";



export const metadata = {
  title: { default: "ToolCoup Intelligence", template: "%s · ToolCoup Intelligence" },
  description:
    "Historical coup evidence and country risk analysis. ACLED signals, cross-source historical records and interpretable forecasts.",
};

export default function RootLayout({ children }) {
  const { meta } = getSummary();
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region }));
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">▥</span> TOOLCOUP<span className="brand-tag"> / RESEARCH TERMINAL</span></Link>
          <nav className="site-nav" aria-label="Workspace navigation">
            <Link href="/">01 / Workspace</Link>
            <Link href="/metodo">02 / Methodology</Link>
          </nav>
          <CountrySearch options={options} />
        </header>
        {meta.demo && (
          <div className="banner" role="status">
            <strong>Synthetic demonstration data.</strong> Events and probabilities are randomly generated to demonstrate the interface and do not describe real countries.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
