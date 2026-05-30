import type { APIRoute } from "astro";
import { cacheStats, pruneCache } from "@/lib/cache";

export const GET: APIRoute = async () => {
  await pruneCache();
  return Response.json(await cacheStats(), {
    headers: { "Cache-Control": "no-store" }
  });
};
