export const SEARCH_RATE_LIMIT_PERIOD_SECONDS = 60;

export type RateLimitBinding = {
  limit(input: { key: string }): Promise<{ success: boolean }>;
};

export async function searchRateLimitResponse(request: Request, limiter?: RateLimitBinding) {
  if (!limiter) return null;

  const clientKey = request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
  try {
    const { success } = await limiter.limit({ key: clientKey });
    if (success) return null;
  } catch (error) {
    console.error("[security] SEARCH_RATE_LIMIT_CHECK_FAILED", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }

  console.warn("[security] SEARCH_RATE_LIMITED");
  return Response.json({ error: "Too many search requests" }, {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "X-Film-Bluesia-Rate-Limit": "limited",
      "Retry-After": String(SEARCH_RATE_LIMIT_PERIOD_SECONDS)
    }
  });
}
