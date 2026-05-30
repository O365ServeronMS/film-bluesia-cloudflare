import type { APIRoute } from "astro";
import { getCategories } from "@/lib/ophim";

export const GET: APIRoute = async () => {
  try {
    return Response.json(await getCategories(), {
      headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
};
