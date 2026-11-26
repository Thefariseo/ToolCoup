import { watchlist } from "@/lib/console";
import { heroSvg } from "@/lib/globe-still";

// GET /globe-still.svg: the home hero's picture of this issue, drawn from the published figures.
export function GET() {
  return new Response(heroSvg(watchlist()), { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
