// Server-side readers for the forecast files the monthly pipeline writes besides the coup forecast:
//   webdata/violence.json  political-violence outlook (LightGBM Tweedie, reconciled, with intervals)   <- pipeline/cast.py
//   webdata/analogs.json   historical analogs                                                           <- pipeline/analogs.py
//   webdata/unrest.json    probability of a protest wave / a violence escalation in the next 3 months   <- pipeline/unrest.py
//   webdata/unrest_counts.json  protests and riots per four-week period, country and province          <- pipeline/cast.py --kind unrest
import violence from "@/webdata/violence.json";
import analogs from "@/webdata/analogs.json";
import standing from "@/webdata/standing.json";
import unrest from "@/webdata/unrest.json";
import unrestCounts from "@/webdata/unrest_counts.json";

export const getViolence = (slug) => (violence.countries?.[slug] ? { meta: violence.meta, country: violence.countries[slug], admin1: violence.admin1?.[slug] || [] } : null);
export const getViolenceGlobal = () => (violence.global?.fc ? { meta: violence.meta, global: violence.global } : null);
export const getAnalogs = (slug) => analogs.countries?.[slug] || null;
export const analogsMeta = () => analogs.meta;
export const getStanding = (slug) => standing.countries?.[slug] || null;

/** Probabilities of a protest wave and of a violence escalation over the next three months, for one country (null when the country has none). */
export const getUnrest = (slug) => (unrest.countries?.[slug] ? { meta: unrest, country: unrest.countries[slug] } : null);
export const getUnrestAll = () => (unrest.countries && Object.keys(unrest.countries).length ? unrest : null);
/** Protests and riots counted per four-week period: six periods ahead with intervals, country and provinces. Same shape as the violence outlook. */
export const getUnrestCounts = (slug) => (unrestCounts.countries?.[slug] ? { meta: unrestCounts.meta, country: unrestCounts.countries[slug], admin1: unrestCounts.admin1?.[slug] || [] } : null);
export const getUnrestCountsGlobal = () => (unrestCounts.global?.fc ? { meta: unrestCounts.meta, global: unrestCounts.global } : null);
