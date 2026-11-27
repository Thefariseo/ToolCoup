"use client";

import Link from "next/link";
import { usePick } from "@/components/home/Pick";

/** The way to the picked country's brief: it is built from the console's readout. */
export default function BriefLink() {
  const { selected } = usePick();
  return <Link className="link" href={`/forecast?c=${selected.slug}`} prefetch={false}>Get {selected.name}&apos;s brief</Link>;
}
