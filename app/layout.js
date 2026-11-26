import { preload } from "react-dom";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-serif/500.css";
// the design kit (copied unchanged into public/assets), then the product's own tokens and views
import "../public/assets/system.css";
import "../public/assets/ui/cards.css";
import "../public/assets/layout/layout.css";
import "./styles/theme.css";
import "./styles/site.css";
import "./styles/data.css";
import "./styles/console.css";
import "./styles/home.css";
import SiteNav from "@/components/site/SiteNav";
import HoverText from "@/components/motion/HoverText";
import Ticker from "@/components/Ticker";
import { watchlist } from "@/lib/console";
import { getSummary, listCountries } from "@/lib/data";
import { modelItems } from "@/lib/ticker";

// Absolute address for the share-image tags: the production domain Vercel assigns, else the local server.
const ORIGIN = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3210";

export const metadata = {
  metadataBase: new URL(ORIGIN),
  applicationName: "Praevex",
  title: { default: "Praevex: coup-risk forecasts for every country", template: "%s · Praevex" },
  description:
    "A monthly coup-risk forecast for every country, filed in public before its window opens and scored against what happens, with violence, unrest and market outlooks.",
  openGraph: { siteName: "Praevex", title: "Praevex: coup-risk forecasts for every country", description: "Where, when and why: a monthly chance of a coup attempt for every country, with a public registry of past forecasts.", type: "website" },
  twitter: { card: "summary_large_image", title: "Praevex: coup-risk forecasts for every country", description: "A monthly chance of a coup attempt for every country, filed in public and scored against what happens." },
  other: { "site-kind": "software", "page-type": "software" },
};

export const viewport = { themeColor: "#070909", colorScheme: "dark", viewportFit: "cover" };

// Before the first paint: the hero's words wait for motion.js (shown by the 700ms mark if it is late), and the
// moments' hidden states arm themselves (released after 2.5s if their module never arrives).
const ENTER = "document.documentElement.classList.add('m-enter','mo-js');setTimeout(()=>document.documentElement.classList.add('m-enter-done'),700);setTimeout(()=>document.documentElement.classList.add('mo-safe'),2500)";

export default function RootLayout({ children }) {
  const ranked = new Map(watchlist().map((c) => [c.slug, c]));
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region, iso: c.iso, risk: ranked.get(c.slug)?.risk, pos: ranked.get(c.slug)?.pos }));
  const { meta } = getSummary();
  preload("/brand/praevex-lockup-dark-sm.webp", { as: "image" });
  return (
    <html lang="en" data-type="software" data-radius="sharp" data-ground="sand" data-buttons="tonal" data-motion="" data-tone="dark" suppressHydrationWarning>
      <head>
        {/* the kit's hover and entrance layer, linked as it ships (its checker looks for this file) */}
        <link rel="stylesheet" href="/assets/motion/motion.css" />
        <script dangerouslySetInnerHTML={{ __html: ENTER }} />
      </head>
      <body>
        <SiteNav options={options} />
        {meta.demo && (
          <div className="banner" role="status">
            <strong>Synthetic demonstration data.</strong> Events and probabilities are randomly generated to demonstrate the interface and do not describe real countries.
          </div>
        )}
        {children}
        <Ticker initial={modelItems()} />
        <HoverText />
      </body>
    </html>
  );
}
