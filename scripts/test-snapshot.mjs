import assert from "node:assert";
import { generateSnapshots } from "../lib/snapshot.ts";
import { setRuntimeEnv } from "../lib/runtime-env.ts";
import crypto from "node:crypto";

// Polyfill Web Crypto API for Node.js if needed (Node >= 19 has globalThis.crypto)
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

// Mock R2Bucket
class MockR2Bucket {
  constructor() {
    this.store = new Map();
    this.putCalls = 0;
  }

  async get(key) {
    const value = this.store.get(key);
    if (!value) return null;
    return {
      json: async () => JSON.parse(value.data)
    };
  }

  async put(key, value, options) {
    this.putCalls++;
    this.store.set(key, { data: value, options });
    return {};
  }
}

let failKey = null;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const urlStr = url.toString();
  if (urlStr.includes("phim-moi-cap-nhat") && failKey === "list-latest") throw new Error("Mock failure");
  if (urlStr.includes("phim-le") && failKey === "list-single") throw new Error("Mock failure");
  if (urlStr.includes("phim-bo") && failKey === "list-series") throw new Error("Mock failure");
  if (urlStr.includes("hoat-hinh") && failKey === "list-hoathinh") throw new Error("Mock failure");
  if (urlStr.includes("tv-shows") && failKey === "list-tvshows") throw new Error("Mock failure");
  if (urlStr.includes("the-loai") && failKey === "categories") throw new Error("Mock failure");
  if (urlStr.includes("quoc-gia") && failKey === "countries") throw new Error("Mock failure");
  // we can use list-latest as a proxy for home failing because home fetches all these
  if (failKey === "home" && urlStr.includes("phim-moi-cap-nhat")) throw new Error("Mock failure");

  return {
    ok: true,
    json: async () => ({
      data: {
        items: [{ slug: "mock-movie", name: "Mock Movie", poster_url: "mock.jpg", thumb_url: "mock.jpg" }],
        APP_DOMAIN_CDN_IMAGE: "https://img"
      },
      pagination: { totalItems: 1, totalItemsPerPage: 24, currentPage: 1, totalPages: 1 }
    })
  };
};



async function runTests() {
  console.log("Running snapshot tests...");
  let mockBucket = new MockR2Bucket();
  
  // Test 1: Successful generation of all snapshots
  setRuntimeEnv({ SNAPSHOTS: mockBucket });
  failKey = null;
  let result = await generateSnapshots();
  assert.strictEqual(result.success, true);
  
  let manifest = mockBucket.store.get("manifest/latest.json");
  assert.ok(manifest);
  let parsedManifest = JSON.parse(manifest.data);
  assert.ok(parsedManifest.snapshots["home"]);
  
  let initialPutCalls = mockBucket.putCalls;

  // Test 2: Rerun, should skip writing same hashes
  result = await generateSnapshots();
  assert.strictEqual(result.success, true);
  // It still updates the manifest file but skips the 8 actual snapshot files
  assert.strictEqual(mockBucket.putCalls, initialPutCalls + 1);

  // Test 3: Partial failure should not update manifest
  mockBucket = new MockR2Bucket(); // clear state
  setRuntimeEnv({ SNAPSHOTS: mockBucket });
  
  // Create an initial manifest
  await mockBucket.put("manifest/latest.json", JSON.stringify({
    version: 1,
    snapshots: {
      "home": { hash: "oldhash", updatedAt: 1234 }
    }
  }));
  
  initialPutCalls = mockBucket.putCalls;
  
  failKey = "home"; // force 'home' to fail
  result = await generateSnapshots();
  assert.strictEqual(result.success, false);
  
  let manifestAfterFail = mockBucket.store.get("manifest/latest.json");
  // The manifest should be the exact same we put (meaning no new put for manifest)
  let parsedManifestAfterFail = JSON.parse(manifestAfterFail.data);
  assert.strictEqual(parsedManifestAfterFail.snapshots["home"].hash, "oldhash");
  // Put calls should only include the successful snapshots (7) + the initial manifest (1) = 8.
  // There should NOT be an extra put for manifest.
  // initialPutCalls = 1. After 7 successes, it should be 8.
  assert.strictEqual(mockBucket.putCalls, 8);
  
  console.log("All snapshot tests passed.");
}

runTests().catch(err => {
  console.error("Test failed", err);
  process.exit(1);
});
