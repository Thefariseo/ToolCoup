import { getCountry } from "@/lib/data";

// GET /api/countries/niger
export async function GET(_request, { params }) {
  const { slug } = await params;
  const country = getCountry(slug);
  if (!country) return Response.json({ error: "Country not found" }, { status: 404 });
  return Response.json(country);
}
