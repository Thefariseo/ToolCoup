import Link from "next/link";
import Brand from "@/components/Brand";
import { REPO } from "@/lib/registry";

const link = (href, label, external) => (
  <li>{external
    ? <a href={href} data-scramble><span className="sx">{label}</span></a>
    : <Link href={href} prefetch={href === "/world" ? false : undefined} data-scramble><span className="sx">{label}</span></Link>}</li>
);

/** The site directory: the logo and one line, three columns, the sources. Shared by both footers. */
export function FooterDirectory({ generated }) {
  return (
    <div className="closing__links">
      <div className="grid">
        <div className="span-5 stack-5">
          <Link className="footer__logo" href="/" aria-label="Praevex, home"><Brand variant="tagline" height={110} lazy /></Link>
          <p className="footer__lede">A monthly coup-risk forecast for every country, filed in public and scored against what happens.</p>
        </div>
        <div className="span-2 start-7 footer__col"><h3>Forecast</h3><ul>{link("/registry", "Registry")}{link("/metodo", "Method")}{link("/world", "Map")}</ul></div>
        <div className="span-2 footer__col"><h3>Outlooks</h3><ul>{link("/violence", "Violence")}{link("/unrest", "Unrest")}{link("/markets", "Markets")}</ul></div>
        <div className="span-2 footer__col"><h3>Open data</h3><ul>{link("/api/registry", "Registry API", true)}{link(REPO, "Code on GitHub", true)}</ul></div>
      </div>
      <div className="footer__legal">
        <span>© 2026 Praevex</span>
        <p>
          Sources: ACLED, V-Dem, World Bank, Powell &amp; Thyne and other coup datasets{generated ? `; last refreshed ${generated}` : ""}.
          Model estimates: even the highest chance is far from a sure thing.
        </p>
      </div>
    </div>
  );
}

/** The footer of the data pages. */
export default function SiteFooter({ generated }) {
  return (
    <footer className="footer site-foot">
      <div className="wrap"><FooterDirectory generated={generated} /></div>
    </footer>
  );
}
