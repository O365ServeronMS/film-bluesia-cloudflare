import type { APIRoute } from "astro";
import { OPHIM_REFRESH_MAX_MOVIES, refreshLatestOphimMovies, refreshOphimMovie } from "@/lib/ophim";
import { setCacheBypassRefresh, setRuntimeEnv } from "@/lib/runtime-env";

const RATE_LIMIT_KEY = "admin-refresh:rate-limit";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 600;

type AdminRefreshBody = {
  mode?: "latest" | "movie";
  slug?: string;
  force?: boolean;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

type AdminRefreshEnv = NonNullable<App.Locals["runtime"]>["env"];

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function rateLimit(env: AdminRefreshEnv) {
  const kv = env.KV || env.MOVIE_METADATA;
  if (!kv) return { ok: true };

  const now = Date.now();
  const raw = await kv.get(RATE_LIMIT_KEY);
  let current: RateLimitState | undefined;
  try {
    current = raw ? JSON.parse(raw) as RateLimitState : undefined;
  } catch {
    current = undefined;
  }
  const state = current && current.resetAt > now
    ? { count: current.count + 1, resetAt: current.resetAt }
    : { count: 1, resetAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000 };

  await kv.put(RATE_LIMIT_KEY, JSON.stringify(state), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
    metadata: { namespace: "admin-refresh", resetAt: String(state.resetAt) }
  });

  return {
    ok: state.count <= RATE_LIMIT_MAX,
    retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000))
  };
}

async function parseBody(request: Request): Promise<AdminRefreshBody> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as AdminRefreshBody : {};
  } catch {
    return {};
  }
}

export const POST: APIRoute = async ({ locals, request }) => {
  const env = (locals.runtime?.env || {}) as AdminRefreshEnv;
  setRuntimeEnv(env);

  const expectedToken = String(env?.ADMIN_REFRESH_TOKEN || "");
  const receivedToken = request.headers.get("x-refresh-token") || "";
  if (!expectedToken || !receivedToken || !timingSafeEqual(receivedToken, expectedToken)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const limit = await rateLimit(env);
  if (!limit.ok) {
    return json({ ok: false, error: "Rate limit exceeded", retryAfterSeconds: limit.retryAfterSeconds }, 429);
  }

  const body = await parseBody(request);
  const mode = body.mode || "latest";
  const force = body.force === true;
  const startedAt = Date.now();

  if (mode !== "latest" && mode !== "movie") {
    return json({ ok: false, error: "Invalid refresh mode" }, 400);
  }

  if (mode === "movie" && !body.slug) {
    return json({ ok: false, error: "Movie slug is required" }, 400);
  }

  if (force) {
    setCacheBypassRefresh(true);
  }

  try {
    const result = mode === "latest"
      ? await refreshLatestOphimMovies({ maxMovies: OPHIM_REFRESH_MAX_MOVIES })
      : await refreshOphimMovie(body.slug || "");

    return json({
      ok: true,
      mode,
      force,
      durationMs: Date.now() - startedAt,
      result
    });
  } catch (error) {
    return json({
      ok: false,
      mode,
      force,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 502);
  } finally {
    setCacheBypassRefresh(false);
  }
};

export const ALL: APIRoute = async () => json({ ok: false, error: "Method not allowed" }, 405);
