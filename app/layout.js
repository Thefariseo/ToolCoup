
import Link from "next/link";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import "./console.css";
import CountrySearch from "@/components/CountrySearch";
import Nav from "@/components/Nav";
import { getSummary, listCountries } from "@/lib/data";



export const metadata = {
  title: { default: "ToolCoup Intelligence", template: "%s · ToolCoup Intelligence" },
  description:
    "Monthly coup-risk forecasts for every country, filed in public and scored against what happens. ACLED signals, cross-source coup records and an interpretable model.",
  openGraph: { title: "ToolCoup: coup risk console", description: "Where, when and why: a monthly coup-risk forecast for every country, with a public registry of past forecasts.", type: "website" },
};

export default function RootLayout({ children }) {
  const { meta } = getSummary();
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region }));
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true" /> TOOLCOUP<span className="brand-tag"> / COUP RISK CONSOLE</span></Link>
          <Nav />
          <CountrySearch options={options} />
        </header>
        {meta.demo && (
          <div className="banner" role="status">
            <strong>Synthetic demonstration data.</strong> Events and probabilities are randomly generated to demonstrate the interface and do not describe real countries.
          </div>
        )}
        <div id="main" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
