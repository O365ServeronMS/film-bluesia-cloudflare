import type { APIRoute } from "astro";
import { getMovie, movieDetailCachePolicy } from "@/lib/ophim";

export const GET: APIRoute = async ({ params }) => {
  try {
    const movie = await getMovie(params.slug || "");
    const policy = movieDetailCachePolicy(movie);
    const cacheClass = policy.cacheClass === "full" ? "CACHE_LONG_TTL_FULL" : "CACHE_SHORT_TTL_TRAILER";
    return Response.json(movie, {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${policy.ttlSeconds}, stale-while-revalidate=3600`,
        "X-Film-Bluesia-Cache-Class": cacheClass
      }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }
};
