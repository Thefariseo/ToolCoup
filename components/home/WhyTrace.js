"use client";

import Link from "next/link";
import WhyLedger from "@/components/WhyLedger";
import { usePick } from "@/components/home/Pick";
import { pct } from "@/lib/format";

/** "Why": the picked country's model ledger. */
export default function WhyTrace({ refP, featureGroup }) {
  const { selected, detail } = usePick();
  return (
    <>
      <div className="home-head why-head">
        <div>
          <h2 id="why-h">Why {selected.name} reads {pct(selected.risk)}</h2>
          <p>Start from a reference country, then let each group of facts push the odds up or down. Choose a group to see inside it.</p>
        </div>
        <Link className="link" href={`/forecast?c=${selected.slug}&v=trace`} prefetch={false}>Read the full model trace</Link>
      </div>
      <WhyLedger country={selected} detail={detail} refP={refP} featureGroup={featureGroup} />
    </>
  );
}
