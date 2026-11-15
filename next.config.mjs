/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Files read at request time by the serverless routes (fonts and flags for the dossier PDF, coup source links).
  outputFileTracingIncludes: {
    "/api/dossier/\\[slug\\]": [
      "./assets/fonts/*.ttf",
      "./public/flags/png/*.png",
      "./data/coupdb/attestations.csv", "./data/coupdb/wikipedia_articles.json",
    ],
    "/api/countries/\\[slug\\]": ["./data/coupdb/attestations.csv", "./data/coupdb/wikipedia_articles.json"],
  },
};

export default nextConfig;
