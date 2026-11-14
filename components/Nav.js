"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [["/", "CONSOLE"], ["/registry", "REGISTRY"], ["/world", "ARCHIVE"], ["/metodo", "METHOD"]];

export default function Nav() {
  const path = usePathname();
  const on = (href) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/")) || (href === "/world" && path.startsWith("/paese"));
  return (
    <nav className="site-nav" aria-label="Main">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
