import { getRegistry } from "@/lib/registry";

// GET /api/registry — archived forecast issues with outcomes and scores, plus the labelled hindcast
export async function GET() {
  return Response.json(getRegistry());
}
