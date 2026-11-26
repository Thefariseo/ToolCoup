import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <main id="top" className="page">
        <div className="wrap lost">
          <h1>No page at this address</h1>
          <p className="lede">Country pages sit under /paese/ followed by the country&rsquo;s name. Search for a country in the header, or start from the forecast.</p>
          <p><Link className="btn btn--primary" href="/forecast">See the forecast</Link></p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
