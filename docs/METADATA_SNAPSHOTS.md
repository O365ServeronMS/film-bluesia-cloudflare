# Metadata Snapshots

## Overview
We've introduced an R2-backed, render-ready metadata snapshot pipeline. The goal is to generate immutable snapshots of home data, list pages, and taxonomies to serve fast, cacheable data and decouple from KV for hot reads. 
Currently, the pipeline runs in "shadow mode" only, meaning it generates and writes snapshots to an R2 bucket but does not yet serve them to user traffic.

## Object Schema & Key Layout
- Immutable snapshots are stored under `<type>/<hash>.json`.
  - Example: `home/a1b2c3d4...json`
  - Example: `list-latest/f9e8d7...json`
- The `hash` is a SHA-256 hash of the normalized JSON string of the object.
- A `manifest/latest.json` points to the latest snapshot hashes for each type.

Example `manifest/latest.json`:
```json
{
  "version": 1,
  "snapshots": {
    "home": {
      "hash": "a1b2c3...",
      "updatedAt": 1700000000000
    },
    "list-latest": { ... }
  }
}
```

## Cloudflare Setup Required

To fully deploy this pipeline, you need to set up the R2 bucket and configure caching correctly:

### 1. Bucket Creation
Create an R2 bucket named `film-snapshots` in the Cloudflare Dashboard.

### 2. Custom Domain
Map a custom domain (e.g., `snapshots.film.bluesia.net` or similar) to the `film-snapshots` bucket to allow HTTP access.

### 3. Cache Everything & Smart Tiered Cache
Configure Page Rules or Cache Rules on the custom domain:
- **Cache Everything**: Since all responses from the R2 bucket are JSON data, configure Cloudflare to cache these responses.
- **Smart Tiered Cache**: Enable Smart Tiered Caching to improve cache hit rates and reduce reads from the origin R2 bucket.

## Rollback Behavior
Because snapshots are immutable and uniquely hashed, rolling back involves publishing an older `manifest/latest.json`. Partial failures during snapshot generation will abort the manifest update entirely to ensure consistency.

## Testing
Run `npm run test:snapshot` to verify the pipeline logic using a mock R2 bucket. Unchanged data skips R2 writes to save costs.
