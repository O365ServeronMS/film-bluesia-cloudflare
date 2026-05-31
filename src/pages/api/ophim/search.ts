import type { APIRoute } from "astro";
import { searchMovies } from "@/lib/ophim";

export const GET: APIRoute = async ({ url }) => {
  try {
    const keyword = url.searchParams.get("keyword") || "";
    const page = Number(url.searchParams.get("page") || "1");
    const limit = Number(url.searchParams.get("limit") || "24");
    return Response.json(await searchMovies(keyword, page, limit), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" }
    });
  }
};
