import type { APIRoute } from "astro";
import { env as cloudflareEnv } from "cloudflare:workers";
import { searchMovies } from "@/lib/ophim";
import { searchRateLimitResponse, type RateLimitBinding } from "@/lib/search-rate-limit";

export const GET: APIRoute = async ({ request, url }) => {
  const env = cloudflareEnv as unknown as { SEARCH_RATE_LIMITER?: RateLimitBinding };
  const limiter = env.SEARCH_RATE_LIMITER;
  const rateLimitHeader = limiter ? "checked" : "unavailable";

  try {
    const limited = await searchRateLimitResponse(request, limiter);
    if (limited) return limited;

    const keyword = url.searchParams.get("keyword") || "";
    const page = Number(url.searchParams.get("page") || "1");
    const limit = Number(url.searchParams.get("limit") || "24");
    return Response.json(await searchMovies(keyword, page, limit), {
      headers: {
        "Cache-Control": "no-store",
        "X-Film-Bluesia-Rate-Limit": rateLimitHeader
      }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
        "X-Film-Bluesia-Rate-Limit": rateLimitHeader
      }
    });
  }
};
