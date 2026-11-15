// Headlines for a brief, found in function of what our own data suggest. The search is not "news about the country": each angle is a question the
// data raise (protests running above their baseline, a regional body that suspended the country, an election, a ruler of eighty), and it is run
// against the vetted outlets only. Every headline comes back labelled with the angle that found it and the reason that angle was searched, so the
// writer can tie reporting to evidence instead of listing the news. Server only.
import "server-only";
import { ALIASES } from "@/lib/aliases";
import { OUTLET_GROUPS, decode, hostOf, sourceOf } from "@/lib/outlets";
import { OFF_TOPIC, pressPlan } from "@/lib/press-plan";

export { pressPlan };

const esc = (re) => re.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Headlines for the planned angles from the vetted outlets, newest first within each angle. `plan[i].found` says how many each angle returned. */
export async function fetchPress(facts, days = 75, perAngle = 6, limit = 24) {
  const slug = facts.country.slug, names = ALIASES[slug] || [facts.country.name], plan = pressPlan(facts), notes = [];
  const quoted = names.map((n) => `"${n}"`).join(" OR ");
  const jobs = plan.flatMap((p) => OUTLET_GROUPS.map((group) => ({ p, group })));
  const xmls = [];
  for (let i = 0; i < jobs.length; i += 8) {                                          // eight searches at a time, not all at once
    xmls.push(...await Promise.all(jobs.slice(i, i + 8).map(async ({ p, group }) => {
      const q = `(${quoted}) (${p.terms}) (${group.map((d) => `site:${d}`).join(" OR ")}) when:${days}d`;
      try {
        const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Praevex/1.0)" }, signal: AbortSignal.timeout(9000), cache: "no-store" });
        if (!res.ok) { notes.push(`HTTP ${res.status}`); return { p, xml: "" }; }
        return { p, xml: await res.text() };
      } catch { notes.push("unavailable"); return { p, xml: "" }; }
    })));
  }
  if (!xmls.some((x) => x.xml.trim())) return { items: [], plan: plan.map(({ re, ...p }) => ({ ...p, found: 0 })), note: `press search ${notes[0] || "unavailable"}` };
  const mention = new RegExp(`\\b(${names.map(esc).join("|")})\\b`, "i");
  const byAngle = new Map(plan.map((p) => [p.angle, []])), seen = new Set();
  for (const { p, xml } of xmls) {                                                      // `plan` is in priority order, so an item found by two angles stays with the stronger one
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const it = m[1], src = it.match(/<source url="([^"]*)"/)?.[1] || "", outlet = sourceOf(hostOf(src));
      if (!outlet) continue;
      let title = decode(it.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "").replace(/\s+-\s+[^-]{2,40}$/, "");
      const date = new Date(it.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ""), k = title.toLowerCase().slice(0, 70);
      if (!title || isNaN(date) || date.getTime() < Date.now() - days * 864e5 || seen.has(k) || !mention.test(title) || !p.re.test(title) || OFF_TOPIC.test(title)) continue;   // the search ignores `when:` once the query is long
      if (slug === "guinea" && /Bissau|Equatorial|Papua/i.test(title)) continue;
      seen.add(k);
      byAngle.get(p.angle).push({ title, outlet, domain: hostOf(src), date: date.toISOString().slice(0, 10), url: decode(it.match(/<link>([\s\S]*?)<\/link>/)?.[1] || ""), angle: p.angle });
    }
  }
  const items = [];
  for (const p of plan) items.push(...byAngle.get(p.angle).sort((a, b) => b.date.localeCompare(a.date)).slice(0, perAngle));
  const kept = items.slice(0, limit).map((x, i) => ({ id: `P${i + 1}`, ...x }));
  return { items: kept, plan: plan.map(({ re, terms, ...p }) => ({ ...p, found: kept.filter((x) => x.angle === p.angle).length })), note: kept.length ? null : `no headlines from the listed outlets in the last ${days} days` };
}
