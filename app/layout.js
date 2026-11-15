
import Link from "next/link";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/ibm-plex-serif/500.css";
import "@fontsource/ibm-plex-serif/600.css";
import "./globals.css";
import "./console.css";
import "./praevex.css";
import Brand from "@/components/Brand";
import HoverText from "@/components/motion/HoverText";
import CountrySearch from "@/components/CountrySearch";
import Nav from "@/components/Nav";
import Ticker from "@/components/Ticker";
import { getSummary, listCountries } from "@/lib/data";
import { modelItems } from "@/lib/ticker";



// Absolute address for the share-image tags: the production domain Vercel assigns, else the local server.
const ORIGIN = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3210";

export const metadata = {
  metadataBase: new URL(ORIGIN),
  applicationName: "Praevex",
  title: { default: "Praevex · Political instability intelligence", template: "%s · Praevex" },
  description:
    "Monthly coup-risk forecasts for every country, filed in public and scored against what happens. ACLED signals, cross-source coup records and an interpretable model.",
  openGraph: { siteName: "Praevex", title: "Praevex · Coup-risk forecasts for every country", description: "Where, when and why: a monthly coup-risk forecast for every country, with a public registry of past forecasts.", type: "website" },
  twitter: { card: "summary_large_image", title: "Praevex · Coup-risk forecasts for every country", description: "A monthly coup-risk forecast for every country, filed in public and scored against what happens." },
};

export const viewport = { themeColor: "#060808", colorScheme: "dark" };

export default function RootLayout({ children }) {
  const { meta } = getSummary();
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region }));
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="Praevex, home"><Brand variant="lockup" height={40} /></Link>
          <Nav />
          <CountrySearch options={options} />
        </header>
        {meta.demo && (
          <div className="banner" role="status">
            <strong>Synthetic demonstration data.</strong> Events and probabilities are randomly generated to demonstrate the interface and do not describe real countries.
          </div>
        )}
        <div id="main" tabIndex={-1}>{children}</div>
        <Ticker initial={modelItems()} />
        <HoverText />
      </body>
    </html>
  );
}
