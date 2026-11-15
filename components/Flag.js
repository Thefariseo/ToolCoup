import { flagSrc } from "@/lib/flags";

/** Country flag (country-flag-icons, MIT). Decorative: the country name always sits next to it. */
export default function Flag({ iso, height = 18, className = "" }) {
  const src = flagSrc(iso);
  if (!src) return null;
  return <img className={`flag ${className}`} src={src} alt="" width={Math.round(height * 1.5)} height={height} loading="lazy" decoding="async" />;
}
