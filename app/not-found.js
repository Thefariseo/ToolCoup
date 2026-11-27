import Link from "next/link";
import CountrySearch from "@/components/CountrySearch";
import SiteFooter from "@/components/SiteFooter";
import { listCountries } from "@/lib/data";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  const options = listCountries().map((c) => ({ slug: c.slug, name: c.name, region: c.region }));
  return (
    <>
      <main id="top" className="page">
        <div className="wrap lost">
          <h1>No page at this address</h1>
          <p className="lede">Find the country you were after, or start from the forecast.</p>
          <div className="lost__find"><CountrySearch options={options} label="Find a country" placeholder="Try Niger, Peru, Thailand" /></div>
          <p><Link className="btn btn--primary" href="/forecast">See the forecast</Link></p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
