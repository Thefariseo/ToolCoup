"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [["/", "Forecast"], ["/registry", "Registry"], ["/violence", "Violence"], ["/markets", "Markets"], ["/world", "Map"], ["/metodo", "Method"]];

export default function Nav() {
  const path = usePathname();
  const on = (href) => (href === "/" ? path === "/" || path.startsWith("/paese") : path === href || path.startsWith(href + "/"));   // a country page is a deeper reading of the forecast
  return (
    <nav className="site-nav" aria-label="Main">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined} data-scramble><span className="sx">{label}</span></Link>
      ))}
    </nav>
  );
}
