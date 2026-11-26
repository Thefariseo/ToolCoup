import Link from "next/link";

/** The leading countries of a map, listed over its empty ocean (under it on a narrow screen).
 *  rows: [{slug, name, figure, note}]; `hash` opens a part of the country page. */
export default function Leaders({ rows, title, hash = "" }) {
  return (
    <div className="leaders">
      <p>{title}</p>
      <ol>
        {rows.map((r) => (
          <li key={r.slug}>
            <Link href={`/paese/${r.slug}${hash}`} prefetch={false}><span className="leaders__name">{r.name}</span><b>{r.figure}</b>{r.note && <small>{r.note}</small>}</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
