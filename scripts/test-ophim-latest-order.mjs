import assert from "node:assert/strict";

const sourceItems = Array.from({ length: 24 }, (_, index) => ({
  name: `Movie ${index + 1}`,
  slug: index === 7 ? "khu-rung-than-bi" : `movie-${index + 1}`,
  modified: { time: new Date(Date.UTC(2026, 5, 19, 14, 30 - index)).toISOString() }
}));

let requestedUrl = "";
globalThis.fetch = async (input) => {
  requestedUrl = String(input);
  return new Response(JSON.stringify({
    data: {
      items: sourceItems,
      params: {
        pagination: {
          currentPage: 1,
          totalItems: sourceItems.length,
          totalItemsPerPage: sourceItems.length,
          totalPages: 1
        }
      }
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

const { getList } = await import("../lib/ophim.ts");
const result = await getList("phim-moi-cap-nhat", 1, 24);
const request = new URL(requestedUrl);

assert.equal(request.pathname, "/v1/api/danh-sach/phim-moi-cap-nhat");
assert.equal(request.searchParams.get("page"), "1");
assert.equal(request.searchParams.get("limit"), "24");
assert.equal(request.searchParams.get("sort_field"), "modified.time");
assert.equal(request.searchParams.get("sort_type"), "desc");
assert.deepEqual(
  result.items.map((movie) => movie.slug),
  sourceItems.map((movie) => movie.slug),
  "latest movies must preserve the official source order without applying the hidden-list blacklist"
);

console.log("OPhim latest order: query and 24-item source order passed");
