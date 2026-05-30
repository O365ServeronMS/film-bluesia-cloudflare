import type { APIRoute } from "astro";
import { getMovie } from "@/lib/ophim";

export const GET: APIRoute = async ({ params }) => {
  try {
    return Response.json(await getMovie(params.slug || ""), {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
};
