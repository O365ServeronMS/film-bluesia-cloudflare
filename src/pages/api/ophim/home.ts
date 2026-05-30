import type { APIRoute } from "astro";
import { getHome } from "@/lib/ophim";

export const GET: APIRoute = async () => {
  try {
    return Response.json(await getHome(), {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 502 });
  }
};
