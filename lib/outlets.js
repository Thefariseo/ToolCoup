// Outlets whose headlines may enter a dossier or the ticker. Anything else returned by the search is dropped.
export const PRESS_SOURCES = {
  "reuters.com": "Reuters", "apnews.com": "Associated Press", "bbc.com": "BBC", "bbc.co.uk": "BBC", "aljazeera.com": "Al Jazeera",
  "france24.com": "France 24", "rfi.fr": "RFI", "dw.com": "Deutsche Welle", "theguardian.com": "The Guardian", "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post", "ft.com": "Financial Times", "economist.com": "The Economist", "bloomberg.com": "Bloomberg",
  "voanews.com": "Voice of America", "africanews.com": "Africanews", "theafricareport.com": "The Africa Report", "csmonitor.com": "Christian Science Monitor",
  "crisisgroup.org": "International Crisis Group", "reliefweb.int": "ReliefWeb (UN OCHA)", "news.un.org": "UN News", "un.org": "United Nations",
  "criticalthreats.org": "Critical Threats (AEI)", "acleddata.com": "ACLED",
};

// One Google News search per group of outlets: a single query with every outlet is too long for the search to honour.
export const OUTLET_GROUPS = [
  ["reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "aljazeera.com", "france24.com", "rfi.fr"],
  ["dw.com", "theguardian.com", "nytimes.com", "washingtonpost.com", "ft.com", "economist.com", "bloomberg.com"],
  ["voanews.com", "africanews.com", "theafricareport.com", "csmonitor.com", "crisisgroup.org", "reliefweb.int", "news.un.org", "un.org", "criticalthreats.org", "acleddata.com"],
];

export const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const sourceOf = (host) => { const k = Object.keys(PRESS_SOURCES).find((d) => host === d || host.endsWith("." + d)); return k ? PRESS_SOURCES[k] : null; };
