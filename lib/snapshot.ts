import { getHome, getList, getCategories, getCountries } from "./ophim.ts";
import { runtimeEnv } from "./runtime-env.ts";

export type SnapshotManifestEntry = {
  hash: string;
  updatedAt: number;
};

export type SnapshotManifest = {
  version: 1;
  snapshots: Record<string, SnapshotManifestEntry>;
};

async function sha256(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Ensure TypeScript knows about R2Bucket since we are compiling for Cloudflare Workers
type R2Bucket = any; 

export async function generateSnapshots() {
  const env = runtimeEnv() as { SNAPSHOTS?: R2Bucket };
  const snapshotsBucket = env?.SNAPSHOTS;

  if (!snapshotsBucket) {
    console.warn("[snapshot] SNAPSHOTS R2 binding not found, skipping snapshot generation.");
    return { skipped: true, reason: "missing_binding" };
  }

  const listTypes = [
    { key: "list-latest", fn: () => getList("phim-moi-cap-nhat", 1, 24) },
    { key: "list-series", fn: () => getList("phim-bo", 1, 24) },
    { key: "list-single", fn: () => getList("phim-le", 1, 24) },
    { key: "list-hoathinh", fn: () => getList("hoat-hinh", 1, 24) },
    { key: "list-tvshows", fn: () => getList("tv-shows", 1, 24) },
    { key: "home", fn: () => getHome() },
    { key: "categories", fn: () => getCategories() },
    { key: "countries", fn: () => getCountries() }
  ];

  let currentManifest: SnapshotManifest = { version: 1, snapshots: {} };
  try {
    const manifestObj = await snapshotsBucket.get("manifest/latest.json");
    if (manifestObj) {
      currentManifest = await manifestObj.json();
    }
  } catch (err) {
    console.warn("[snapshot] Could not read existing manifest, starting fresh.", err);
  }

  const nextManifest: SnapshotManifest = {
    version: 1,
    snapshots: { ...currentManifest.snapshots }
  };

  const results = [];
  let hasFailures = false;

  for (const { key, fn } of listTypes) {
    try {
      const data = await fn();
      const json = JSON.stringify(data);
      const hash = await sha256(json);

      const existingEntry = currentManifest.snapshots[key];
      if (existingEntry && existingEntry.hash === hash) {
        results.push({ key, hash, status: "unchanged" });
        continue;
      }

      const objectKey = `${key}/${hash}.json`;
      await snapshotsBucket.put(objectKey, json, {
        httpMetadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=31536000, immutable"
        }
      });

      nextManifest.snapshots[key] = {
        hash,
        updatedAt: Date.now()
      };
      results.push({ key, hash, status: "updated" });
    } catch (err) {
      console.error(`[snapshot] Failed to generate snapshot for ${key}`, err);
      results.push({ key, error: err instanceof Error ? err.message : String(err), status: "failed" });
      hasFailures = true;
    }
  }

  if (hasFailures) {
    console.error("[snapshot] Partial failures occurred. Skipping manifest update.");
    return { success: false, results };
  }

  const manifestJson = JSON.stringify(nextManifest, null, 2);
  await snapshotsBucket.put("manifest/latest.json", manifestJson, {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "public, max-age=60"
    }
  });

  console.log("[snapshot] Snapshot generation complete.", results);
  return { success: true, results };
}
