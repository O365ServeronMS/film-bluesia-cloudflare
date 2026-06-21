import assert from "node:assert/strict";
import { getHome, getList, searchMovies } from "@/lib/ophim";
import { setRuntimeEnv } from "@/lib/runtime-env";

const originalFetch = globalThis.fetch;

setRuntimeEnv({
  KV: {
    get: async () => null,
    put: async () => {
      throw new Error("KV put() limit exceeded for the day.");
    }
  }
});

globalThis.fetch = async () => Response.json({
  status: "success",
  data: {
    APP_DOMAIN_CDN_IMAGE: "https://img.ophim.live",
    items: [{
      _id: "quota-test-id",
      name: "Quota resilience",
      slug: "quota-resilience",
      thumb_url: "quota-resilience-thumb.jpg",
      poster_url: "quota-resilience-poster.jpg",
      year: 2026
    }],
    params: {
      pagination: {
        currentPage: 1,
        totalItems: 1,
        totalItemsPerPage: 24
      }
    }
  }
});

try {
  const result = await getList("phim-le", 1, 24);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].slug, "quota-resilience");
  console.log("KV write resilience: upstream data survives quota failure");

  globalThis.fetch = async () => Response.json({
    status: "success",
    data: {
      APP_DOMAIN_CDN_IMAGE: "https://img.ophim.live",
      items: [],
      params: { pagination: { currentPage: 1, totalItems: 0, totalItemsPerPage: 24 } }
    }
  });

  await assert.rejects(
    () => getHome(),
    /All home catalog sources returned no movies/
  );
  console.log("Home empty guard: zero-item upstream responses cannot become cacheable HTML");

  let searchRequestUrl = "";
  globalThis.fetch = async (input) => {
    searchRequestUrl = String(input);
    return Response.json({
      status: "success",
      data: {
        APP_DOMAIN_CDN_IMAGE: "https://img.ophim.live",
        items: [],
        params: { pagination: { currentPage: 1, totalItems: 0, totalItemsPerPage: 64 } }
      }
    });
  };

  await searchMovies("bounded", -9, 1_000_000);
  const capturedSearchUrl = new URL(searchRequestUrl);
  assert.equal(capturedSearchUrl.searchParams.get("page"), "1");
  assert.equal(capturedSearchUrl.searchParams.get("limit"), "64");

  await searchMovies("finite", Infinity, Number.NaN);
  const finiteSearchUrl = new URL(searchRequestUrl);
  assert.equal(finiteSearchUrl.searchParams.get("page"), "1");
  assert.equal(finiteSearchUrl.searchParams.get("limit"), "24");

  await searchMovies("integer", 3.9, 12.9);
  const integerSearchUrl = new URL(searchRequestUrl);
  assert.equal(integerSearchUrl.searchParams.get("page"), "3");
  assert.equal(integerSearchUrl.searchParams.get("limit"), "12");
  console.log("Search bounds: page and limit are finite clamped integers before the upstream request");
} finally {
  globalThis.fetch = originalFetch;
  setRuntimeEnv(undefined);
}
