import { globePaths } from "@/lib/globe-still";

/** The signal field as a still drawing under a country page's stage; `center` turns it to the country. */
export default function GlobeStill({ list, center = null }) {
  const { sphere, graticule, land } = globePaths(list, [[40, 60], [560, 580]], center);
  return (
    <svg className="field-still" viewBox="0 0 600 640" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={sphere} fill="#030606" stroke="#1b3a37" />
      <path d={graticule} fill="none" stroke="#12302d" strokeWidth=".6" />
      {land.map((l, i) => <path key={i} d={l.d} fill={l.fill} stroke="#030606" strokeWidth=".5" />)}
    </svg>
  );
}
