import assert from "node:assert/strict";
import { GET, upstreamErrorCacheControl } from "../src/pages/api/image.ts";
import { validateImageSourceUrl } from "../lib/image-source-registry.ts";

globalThis.caches = {
  default: {
    async match() {
      return undefined;
    },
    async put() {}
  }
};

function apiUrl(imageUrl, profile = "poster-desktop") {
  const url = new URL("https://film.bluesia.net/api/image");
  url.searchParams.set("url", imageUrl);
  url.searchParams.set("profile", profile);
  return url;
}

async function callImageRoute(imageUrl, fetcher, profile = "poster-desktop") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    const url = apiUrl(imageUrl, profile);
    return await GET({
      request: new Request(url),
      url,
      params: {},
      props: {},
      redirect: () => {
        throw new Error("redirect not implemented in test");
      },
      site: new URL("https://film.bluesia.net"),
      generator: "test",
      clientAddress: "127.0.0.1",
      locals: {},
      cookies: {},
      rewrite: () => {
        throw new Error("rewrite not implemented in test");
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const imageFetch = async (url) => new Response(new Uint8Array([1, 2, 3]), {
  status: 200,
  headers: {
    "content-type": "image/jpeg",
    "content-length": "3"
  }
});

assert.equal(validateImageSourceUrl("https://img.ophim.live/uploads/movies/a.jpg").ok, true);
assert.equal(validateImageSourceUrl("https://img.ophim1.com/uploads/movies/a.jpg").ok, true);
assert.equal(validateImageSourceUrl("https://example.com/a.jpg").ok, false);
assert.equal(validateImageSourceUrl("http://localhost/a.jpg").ok, false);
assert.equal(validateImageSourceUrl("http://127.0.0.1/a.jpg").ok, false);
assert.equal(validateImageSourceUrl("data:image/png;base64,AAAA").ok, false);

{
  const response = await callImageRoute("https://img.ophim.live/uploads/movies/a.jpg", imageFetch);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.equal(response.headers.get("cache-control"), "public, max-age=604800, stale-while-revalidate=86400");
}

{
  const response = await callImageRoute("https://example.com/a.jpg", imageFetch);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).error, "IMAGE_HOST_NOT_ALLOWED");
}

{
  const response = await callImageRoute("http://localhost/a.jpg", imageFetch);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

{
  const response = await callImageRoute("https://img.ophim.live/uploads/movies/a.jpg", async () => new Response("<html></html>", {
    status: 200,
    headers: { "content-type": "text/html" }
  }));
  assert.equal(response.status, 502);
  assert.notEqual(response.headers.get("cache-control"), "public, max-age=604800, stale-while-revalidate=86400");
}

for (const status of [400, 403, 404, 502]) {
  const response = await callImageRoute("https://img.ophim.live/uploads/movies/a.jpg", async () => new Response("nope", {
    status,
    headers: { "content-type": "text/plain" }
  }));
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.notEqual(upstreamErrorCacheControl(status), "public, max-age=604800, stale-while-revalidate=86400");
}

{
  const response = await callImageRoute("https://img.ophim.live/uploads/movies/redirect.jpg", async (url) => {
    if (String(url).includes("redirect")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://img.ophim1.com/uploads/movies/final.jpg" }
      });
    }
    return new Response(new Uint8Array([4, 5, 6]), {
      status: 200,
      headers: { "content-type": "image/webp", "content-length": "3" }
    });
  });
  assert.equal(response.status, 200);
}

{
  const response = await callImageRoute("https://img.ophim.live/uploads/movies/redirect.jpg", async (url) => {
    if (String(url).includes("redirect")) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/final.jpg" }
      });
    }
    return new Response("nope", {
      status: 404,
      headers: { "content-type": "text/plain" }
    });
  });
  assert.notEqual(response.status, 200);
}

console.log("image proxy: route and registry cases passed");
