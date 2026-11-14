import { atlasMatrix } from "@/lib/console";

// GET /api/atlas — quarterly risk matrix (country x quarter since 1975) for the Temporal Atlas
export async function GET() {
  return Response.json(atlasMatrix());
}
