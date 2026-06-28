# FilmBluesia Cloudflare — Claude Guide

## What this project is

FilmBluesia (`film.bluesia.net`) is a Vietnamese movie streaming catalog built with Astro 7 + React 19, deployed as **static assets only on Cloudflare (no Worker)**. All catalog data (home / list / genre / country / detail / search), TMDB metadata, and pre-signed images are served by the VPS **`catalog-api`** at `img.bluesia.net/api/*`, which proxies OPhim, enriches with TMDB, HMAC-signs images, and caches in Valkey. The React islands fetch those payloads **client-side**; the frontend does no SSR, no data proxying, no image signing.

`catalog-api` is a separate service (not in this repo) shared with `phim.bluesia.net` (redflare). Both sites reuse the **same** image cache objects.

---

## Working philosophy

Four principles that override speed when in conflict:

**1. Think before coding** — State assumptions explicitly. If the request has multiple interpretations, name them; don't pick silently. If something is unclear, stop and ask. Push back when a simpler approach exists.

**2. Simplicity first** — Write the minimum code that solves the problem. No features beyond what was asked. No single-use abstractions. Test: *Would a senior engineer say this is overcomplicated?*

**3. Surgical changes** — Touch only what the task requires. Don't improve adjacent code. Match existing style. Remove orphans your change creates. Don't touch pre-existing dead code unless asked.

**4. Goal-driven execution** — Transform tasks into verifiable goals and state a brief plan first.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Astro 7 (`output: "static"`) |
| UI islands | React 19 (selective hydration) |
| Styling | Tailwind CSS 4 via `@tailwindcss/vite` |
| Runtime | Cloudflare **static assets only** (no Worker, no SSR) |
| Catalog data + metadata + images | VPS `catalog-api` at `img.bluesia.net/api/*` (client-side fetch) |
| Taxonomy lists | `ophim1.com/v1/api/{the-loai,quoc-gia}` (client-side) |
| Client data cache | 5-min in-memory map in `lib/catalog.ts` + browser HTTP cache |
| Video (MSE) | `hls.js/dist/hls.light.js` (dynamic import only) |
| Embed fallback | VSEmbed/Vidsrc iframe |
| User state | browser `localStorage` (favorites / history) |
| Icons | lucide-react |

Path alias `@/*` maps to the repo root (via `tsconfig.json`). There is no `tsc`/lint gate — `astro build` is the only automated check.

---

## Commands

```bash
npm run dev       # Astro dev server (http://localhost:4321)
npm run build     # Static build → dist/  (the only automated gate)
npm run preview   # Build, then serve locally via wrangler
npm run deploy    # Build + wrangler deploy (static assets; only when explicitly requested)
```

On Windows use `npm.cmd`.

> **Local data fetch caveat:** `catalog-api` CORS is locked to `https://film.bluesia.net`, so islands cannot load data from `localhost`. Verify data flows on the deployed site, not via local preview.

**Deploy** = `git push origin main` (Cloudflare auto-deploys the static assets) or `npm run deploy`. Confirm before committing/pushing unless told otherwise.

---

## Directory structure

```
src/
  env.d.ts             # Astro client types + PUBLIC_VSEMBED_EMBED_BASE_URL
  layouts/
    BaseLayout.astro   # App shell, head metadata, nav-back handler, TMDB attribution footer
  pages/
    index.astro        # Home shell → HomeIsland
    list/[type].astro  # Category list shell (getStaticPaths: finite types) → ListIsland
    search.astro       # Search shell → SearchSuggest + SearchResults
    movie/index.astro  # Movie detail SHELL → MovieDetailIsland (served for /movie/* via _redirects)
    favorites.astro    # localStorage favorites
    history.astro      # localStorage history
    settings.astro     # Info/settings + TMDB attribution
  client/
    adaptivePrefetch.ts # Route prediction + prefetch (list HTML + catalog-api base list)
  styles/globals.css

components/
  HomeIsland.tsx         # Home: getHome() → HeroSlider + SectionRow
  ListIsland.tsx         # List: getList/getGenre/getCountry + taxonomy filters
  SearchResults.tsx      # Search results: searchMovies()
  SearchSuggest.tsx      # Search suggestions: searchMovies()
  MovieDetailIsland.tsx  # Detail + player: reads slug from URL, getMovie()
  MovieCard.tsx          # Shared poster card (single pre-signed thumb, no srcset)
  HeroSlider.tsx / SectionRow.tsx / TopBar.tsx / BottomNav.tsx / Pagination.tsx
  MoviePlayer.tsx / HlsVideo.tsx / IframePlayerFacade.tsx / WatchRecorder.tsx
  LocalMovieActions.tsx / StoredMovieGrid.tsx

lib/
  catalog.ts      # CATALOG client: getHome/getList/getGenre/getCountry/searchMovies/getMovie,
                  #   getCategories/getCountries, normalizeCard(). No signing, browser-safe.
  types.ts        # Shared types (MovieCard, MovieDetail, Episode, …)
  navigation.ts   # returnTo / nav-source resolution
  episodes.ts     # Episode name/slug/watch-key helpers
  playback.ts     # Device-aware playback source selection
  vsembed.ts      # Vidsrc URL construction (browser-safe)
  spotlight.ts    # Client-side hero personalization (baseSpotlightScore, normalizedLabelSet)
  utils.ts        # cn(), rating display, text helpers

public/
  _redirects      # /watch/* → /movie/:splat (301); /movie/* → /movie/index.html (200 rewrite)
  _headers        # static asset headers

docs/             # DECISIONS, FILE_MAP, DESIGN, PAGINATION (cache/snapshot docs superseded)
```

---

## Deployment & routing (static, zero-Worker)

`wrangler.jsonc` is **assets-only** (no `main`, no KV, no secrets): `assets.directory = "dist"` + the custom domain route.

Dynamic routes under static output:
- **List types** are a finite set → prerendered via `getStaticPaths` in `list/[type].astro`.
- **`/movie/<slug>`** is unbounded → there is no per-slug page. `public/_redirects` rewrites `/movie/*` to the static `dist/movie/index.html` shell (HTTP 200, URL preserved); `MovieDetailIsland` reads the slug from `window.location` and fetches detail client-side.
- **`/watch/<slug>`** → 301 to `/movie/:splat` via `_redirects` (legacy).

Cloudflare Workers Static Assets `_redirects` supports `200` rewrites + `:splat` (verified).

---

## Data flow & caching

1. All catalog data flows through **`catalog-api`** (`img.bluesia.net/api/*`), which proxies OPhim, enriches metadata + images via TMDB, signs images, and caches in **Valkey**. The frontend never touches OPhim (except taxonomy lists) or a Cloudflare Worker.
2. `lib/catalog.ts` is the single client. It keeps a small 5-min in-memory cache; search uses `cache: "no-store"`. Browser HTTP cache covers the rest.
3. Endpoints consumed: `/api/home-data`, `/api/list?type=&page=`, `/api/genre?slug=&page=`, `/api/country?slug=&page=`, `/api/movie/{slug}`, `/api/search?keyword=&page=`. Taxonomy chips come from `ophim1.com/v1/api/{the-loai,quoc-gia}`.
4. **Filters:** `catalog-api`'s `/api/list` ignores `country`/`category` params, so `ListIsland` routes country quick-filters to `/api/country?slug=` and genre filters to `/api/genre?slug=` (one filter at a time; country wins over genre).

To force fresh catalog data: operate on the VPS (`catalog-api` Valkey / container) — there is nothing to invalidate in this repo.

---

## Image URL contract (critical invariant)

Images arrive **pre-signed** from `catalog-api`. The frontend never signs, re-keys, or mints variants.

- `thumb_url` → pre-signed **`/i/m/…`** (TMDB poster, portrait). Used for cards, side poster.
- `poster_url` → pre-signed **`/i/d/…`** (TMDB backdrop, landscape). Used for the detail hero background and as card fallback.
- **Only two variants per movie:** `m` and `d`. Format: `https://img.bluesia.net/i/{m|d}/{sha256}.webp?url={encoded}&sig=v1.{hmac}`.
- **Shared cache invariant:** `film.bluesia.net` and `phim.bluesia.net` produce identical cache keys for the same upstream image (key = `sha256(upstreamUrl)+variant` only). Never add the requester domain, route, or frontend-specific params, and never create a third/site-specific variant.
- `normalizeCard()` sets `MovieCard.thumb`/`poster` to these URLs and leaves `thumbSigned`/`posterSigned` **undefined**; `MovieCard.tsx` then renders a single `<img src={thumb}>` with `poster` as the on-error fallback (handled by the global image-fallback script in `BaseLayout.astro`).
- TMDB attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB.") is required by TMDB ToS — it lives in `BaseLayout.astro` (site-wide footer) and `settings.astro`. Do not remove it.

---

## Navigation rules

User hierarchy: **Category/List → `/movie/<slug>` (detail + player) → episode state**

- `/watch/<slug>` is a legacy redirect only. New links target `/movie/<slug>`.
- Category context persists via `returnTo=<encoded path+search>` query param, not hash fragments.
- Episode changes use **replace navigation** (`window.location.replace`) so browser Back skips episode history and returns to the list page. `MovieDetailIsland` handles episode-link clicks this way; each click reloads the `/movie` shell with new `server`/`ep`/`play` params.
- Bottom nav active tab (`BottomNav.tsx`) derives from `returnTo` first, then pathname (read from `window.location` at runtime), then movie-source fallback. Never default to `Trang chủ` for direct-opened movie URLs.
- `BaseLayout.astro` owns the `data-nav-back` same-origin back handler.
- Anti-regression: open a category → open a movie → select 3 episodes → press Back once → land on the original list URL with the correct tab active.

---

## Playback rules

| Device | Source priority |
|---|---|
| Desktop / Android | iframe/embed first, then direct HLS |
| iOS | native HLS first, then iframe/embed fallback |
| MSE fallback | dynamic import `hls.js/dist/hls.light.js` only |

- Source selection lives in `lib/playback.ts` (`resolvePlaybackSource`, device detection via `navigator`). Do not duplicate it in player components.
- `MovieDetailIsland.tsx` resolves the selected episode + embed URL (Vidsrc host swap for mobile) and passes them to `MoviePlayer`.
- `HlsVideo.tsx` owns OPhim direct HLS (light hls.js, dynamic import). `IframePlayerFacade.tsx` owns Vidsrc/VSEmbed. `MoviePlayer.tsx` owns the "Xem phim" reveal — no autoplay on reveal.
- **Never proxy or re-chunk HLS/M3U8.** Video is browser-to-upstream only.
- `lib/vsembed.ts` builds Vidsrc URLs (`PUBLIC_VSEMBED_EMBED_BASE_URL` optional, defaults to `https://vsembed.ru`).

---

## Data normalization

- `lib/catalog.ts` → `normalizeCard()` is the single source mapping `catalog-api` items (OPhim field shape, pre-signed images) to `MovieCard`. `getMovie()` extends it to `MovieDetail` (episodes, actor/director, category/country lists) and appends the Vidsrc server.
- Ratings: prefer `vote_average` (top-level TMDB) then `tmdb.vote_average`; IMDb from `imdb.vote_average`. Display via `lib/utils.ts`.
- Do not duplicate shape mapping in UI components.

---

## Editing conventions

- **Surgical changes**; no speculative abstractions; reuse `lib/` helpers; match Tailwind/lucide/`clsx` style.
- **Browser-only runtime.** Everything in `lib/` and `components/` runs in the browser — no Node builtins, no `process.env` (use `import.meta.env.PUBLIC_*`), no filesystem.
- **No signing / no KV / no Worker.** Do not reintroduce image signing, OPhim direct catalog fetching, KV, snapshots, or a data Worker — `catalog-api` owns all of that.
- Preserve the mobile-first `max-w-[720px]` shell and bottom-nav behavior.
- Shared poster-card changes go in `components/MovieCard.tsx`.

---

## Lazy-loading rules

- Detail hero image: `loading="eager"` + `fetchpriority="high"` (note: it now loads after the client fetch, since detail is client-rendered).
- All other posters/backdrops: `loading="lazy"` + `decoding="async"`.
- Critical islands (Hero, TopBar, BottomNav, MovieDetailIsland): `client:load`.
- Embed iframes load only after the user presses Play. `hls.js` is a dynamic import only when MSE fallback is needed.

---

## Adaptive prefetch

`src/client/adaptivePrefetch.ts` tracks navigation transitions in `localStorage`. Thresholds: ≥5 transitions, best-target probability ≥0.45. Skips on `saveData`/`slow-2g`/`2g`.

**Never prefetch** `/watch`, `/movie`, player/embed paths, `.m3u8`, `.ts`, `.m4s`, `.mp4`. Safe targets: category/list HTML + the catalog-api base list (`img.bluesia.net/api/list?type=…&page=1`).

---

## Verification checklist

1. `npm run build` — must pass (the only automated gate; emits static `dist/`, no `_worker.js`).
2. UI changes: verify `MovieCard`, `SectionRow`, list/search/home, and mobile layout.
3. Data/image changes: confirm rendered image URLs are `catalog-api` pre-signed `i/{m|d}/…` with no client signing and no new variant.
4. Navigation changes: run the anti-regression test (category → movie → multiple episodes → Back once → correct list + tab).
5. Data flows can only be fully verified on the deployed `film.bluesia.net` (CORS).

---

## Folders to avoid scanning

`node_modules`, `dist`, `.astro`, `.wrangler`, `.vite-cache-build`.
