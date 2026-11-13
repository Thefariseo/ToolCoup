
import Link from "next/link";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import CountrySearch from "@/components/CountrySearch";
import { getSummary, listCountries } from "@/lib/data";



export const metadata = {
  title: { default: "Osservatorio golpe", template: "%s · Osservatorio golpe" },
  description:
    "Colpi di stato dal 1900 a oggi e stima del rischio per paese, da un database che incrocia più fonti e dai dati ACLED.",
};

export default function RootLayout({ children }) {
  const { meta } = getSummary();
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region }));
  return (
    <html lang="it">
      <body>
        <header className="site-header">
          <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">⌖</span> TOOLCOUP<span className="brand-tag"> / OBSERVATORY</span></Link>
          <nav className="site-nav" aria-label="Sezioni">
            <Link href="/">01 / Mondo</Link>
            <Link href="/metodo">02 / Metodo</Link>
          </nav>
          <CountrySearch options={options} />
        </header>
        {meta.demo && (
          <div className="banner" role="status">
            <strong>Dati demo sintetici.</strong> Eventi e probabilità sono generati casualmente per provare lo
            strumento e non descrivono alcun paese reale.
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
