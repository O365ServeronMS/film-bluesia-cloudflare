import type { APIRoute } from "astro";
import { cacheStats, pruneCache } from "@/lib/cache";
import { getHome, getList } from "@/lib/ophim";

function tokenFromEnv(locals: App.Locals) {
  return locals.runtime?.env.BLUESIA_CACHE_WARMUP_TOKEN || process.env.BLUESIA_CACHE_WARMUP_TOKEN || "";
}

export const GET: APIRoute = async ({ request, url, locals }) => {
  const expectedToken = tokenFromEnv(locals);
  const token = url.searchParams.get("token") || request.headers.get("x-bluesia-cache-token") || "";
  if (!expectedToken || token !== expectedToken) {
    return Response.json({ error: "Cache warmup requires a valid token." }, { status: 403 });
  }

  const startedAt = Date.now();
  const results: Array<{ target: string; ok: boolean; items?: number; error?: string }> = [];

  await pruneCache();

  try {
    const home = await getHome();
    results.push({ target: "home", ok: true, items: home.sections.reduce((count, section) => count + section.items.length, 0) });
  } catch (error) {
    results.push({ target: "home", ok: false, error: error instanceof Error ? error.message : "Unknown error" });
  }

  for (const type of ["phim-le", "phim-bo"]) {
    try {
      const list = await getList(type, 1, 24);
      results.push({ target: `list:${type}:1`, ok: true, items: list.items.length });
    } catch (error) {
      results.push({ target: `list:${type}:1`, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  const stats = await cacheStats();
  return Response.json({
    ok: true,
    mode: "cloudflare-free-minimal-warmup",
    requests: results.length,
    errors: results.filter((item) => !item.ok).length,
    results,
    durationMs: Date.now() - startedAt,
    cache: stats
  }, {
    headers: { "Cache-Control": "no-store" }
  });
};
