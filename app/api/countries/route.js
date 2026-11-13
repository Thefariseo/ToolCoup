import { listCountries } from "@/lib/data";

// GET /api/countries?q=testo
export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  return Response.json(listCountries({ q }));
}
