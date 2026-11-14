// Forecast registry: issues archived by pipeline/registry.py, scored against the coup database.
import registry from "@/webdata/registry.json";

export const REPO = "https://github.com/Thefariseo/ToolCoup";
export const getRegistry = () => registry;
export const registrySummary = () => ({ latest: registry.issues[0]?.issue ?? null, count: registry.issues.length });
