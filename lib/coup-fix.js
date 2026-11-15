// One event, one entry. The coup database sometimes holds the same day twice for a country, from different sources and sometimes with opposite
// outcomes (Brasilia, 8 January 2023, is a "failed" entry of confidence A and a "successful" one of confidence B). The pipeline that builds
// webdata/ does not always flag the second as a duplicate, so every count built from it (attempts, successes, the last attempt, the yearly
// timeline) double counts the day. Imported for its effect by lib/data.js and lib/console.js; the rule is in lib/coup-dedupe.js.
// Remove both when the pipeline flags these itself.
import coups from "@/webdata/coups.json";
import countries from "@/webdata/countries.json";
import summary from "@/webdata/summary.json";
import { dedupeSameDay } from "@/lib/coup-dedupe";

dedupeSameDay({ coups, countries, summary });
