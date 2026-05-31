# Cloudflare cache bindings

This deployment uses Cloudflare-native cache storage only.

## Required bindings

- `IMAGE_CACHE`: R2 bucket for poster, backdrop, and thumbnail binaries.
- `KV`: KV namespace for OPhim JSON metadata. `MOVIE_METADATA` is also supported as a backward-compatible binding name.
- `CACHE_REFRESH_TOKEN`: secret used by `?refresh=1&token=...` to bypass HTML and metadata cache.

The production KV namespace is configured in `wrangler.jsonc`:

```powershell
wrangler secret put CACHE_REFRESH_TOKEN
```

## TTL policy

- Images: `1296000` seconds.
- Home, list, taxonomy HTML and metadata: `3600` seconds.
- Movie detail HTML and metadata:
  - `1296000` seconds when the movie is completed/full and has a playable episode link.
  - `3600` seconds for trailers, upcoming movies, missing episode data, or no playable links.
- Search: no-store.

Favorites, watch history, and settings remain client-side localStorage state and are not included in cached HTML.
