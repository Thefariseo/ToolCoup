// Server-side readers for the two forecast files the monthly pipeline writes besides the coup forecast:
//   webdata/violence.json  political-violence outlook (LightGBM Tweedie, reconciled, with intervals)   <- pipeline/cast.py
//   webdata/analogs.json   historical analogs                                                           <- pipeline/analogs.py
import violence from "@/webdata/violence.json";
import analogs from "@/webdata/analogs.json";
import standing from "@/webdata/standing.json";

export const getViolence = (slug) => (violence.countries?.[slug] ? { meta: violence.meta, country: violence.countries[slug], admin1: violence.admin1?.[slug] || [] } : null);
export const getViolenceGlobal = () => (violence.global?.fc ? { meta: violence.meta, global: violence.global } : null);
export const getAnalogs = (slug) => analogs.countries?.[slug] || null;
export const analogsMeta = () => analogs.meta;
export const getStanding = (slug) => standing.countries?.[slug] || null;
