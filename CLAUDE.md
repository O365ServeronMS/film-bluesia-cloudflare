# FilmBluesia Cloudflare — Claude Guide

## What this project is

FilmBluesia (`film.bluesia.net`) is a Vietnamese movie streaming catalog built with Astro 7 + React 19, deployed as a Cloudflare Worker. It fetches movie metadata from the OPhim API, serves signed poster images from a shared external cache (`img.bluesia.net`), and renders a mobile-first UI with device-aware HLS/embed playback.

A companion cron Worker (`film-refresh`) runs hourly to pre-build metadata snapshots into R2, reducing cold-load latency.

Full architectural decisions and anti-regression rules live in `docs/DECISIONS.md`. Read it before changing cache behavior, navigation, playback, or image handling.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Astro 7 (`output: "server"`) |
| UI islands | React 19 (selective hydration) |
| Styling | Tailwind CSS 4.3 |
| Runtime | Cloudflare Workers/Pages |
| Metadata storage | Cloudflare KV |
| HTML cache | Cloudflare Cache API (deployment-scoped) |
| Image delivery | External `img.bluesia.net` (HMAC-signed) |
| Video (MSE) | `hls.js/dist/hls.light.js` (dynamic import only) |
| Embed fallback | VSEmbed/Vidsrc iframe |
| Icons | lucide-react |

TypeScript is strict. Module resolution is `bundler`. Path alias `@/*` maps to the repo root.

---

## Commands

```bash
npm run dev           # Astro dev server (http://localhost:4321)
npm run build         # Production build → dist/
npm run preview       # Build then serve locally via wrangler
npm run deploy        # Build + wrangler deploy (production — only when explicitly requested)
npm run deploy:refresh # Deploy the hourly cron worker separately

# Diagnostic scripts (read-only, safe to run)
npm run test:image-normalization   # Poster/thumb field mapping consistency
npm run test:kv-write-resilience   # KV write-budget logic
npm run test:security-controls     # Admin endpoint token validation
npm run test:ophim-latest-order    # OPhim modified.time ordering
npm run test:snapshot              # Snapshot export format
npm run scan:image-hosts           # Live OPhim CDN hostname diagnostic
```

**Primary verification**: `npm run build`. There is no lint or dedicated typecheck script; Astro build is the only automated check.

On Windows use `npm.cmd` instead of `npm`.

---

## Directory structure

```
src/
  worker.ts            # Cloudflare Worker entry; forwards Astro fetch + scheduled refresh
  worker-refresh.ts    # Hourly cron worker (separate deploy)
  middleware.ts        # HTML Cache API policies, refresh bypass, no-store rules
  env.d.ts             # Cloudflare binding types
  layouts/
    BaseLayout.astro   # App shell, head metadata, returnTo propagation, nav-back handler
  pages/
    index.astro        # Home (hero + section rows)
    list/[type].astro  # Category lists with filters + pagination
    search.astro       # Search
    movie/[slug].astro # Unified detail + playback (canonical)
    watch/[slug].astro # LEGACY — redirects to /movie/[slug]
    favorites.astro    # localStorage favorites
    history.astro      # localStorage history
    settings.astro     # Info/settings
    api/ophim/         # Metadata API routes (home, list, movie, search, categories, countries)
    api/admin/         # Protected refresh trigger
    api/cache/         # Internal cache status
  client/
    adaptivePrefetch.ts # Client-side route prediction + prefetch (localStorage only)
  styles/globals.css

components/
  MovieCard.tsx          # Poster card used by home/list/search/favorites/history
  SectionRow.tsx         # Home grid section wrapper
  HeroSlider.tsx         # Smart Spotlight carousel
  TopBar.tsx             # Sticky search bar
  BottomNav.tsx          # Mobile bottom nav with active-tab context resolution
  SearchSuggest.tsx      # Search input + suggestions
  HlsVideo.tsx           # Direct HLS/m3u8 player (hls.js light + native fallback)
  IframePlayerFacade.tsx # Click-to-load iframe embed player (Vidsrc)
  MoviePlayer.tsx        # Unified player reveal after "Xem phim"
  LocalMovieActions.tsx  # Favorites/history localStorage actions
  StoredMovieGrid.tsx    # localStorage-backed grid
  WatchRecorder.tsx      # Records history after player opens

lib/
  ophim.ts        # OPhim API client, normalizeCard(), getHome(), getList(), getMovie(), refresh
  cache.ts        # KV helpers, TTLs, stable hashes, write budgets, cache stats
  types.ts        # Shared types (MovieCard, MovieDetail, Episode, Source, etc.)
  utils.ts        # Class merging, rating display helpers, text utilities
  spotlight.ts    # Smart Spotlight scoring
  episodes.ts     # Episode name/slug/watch-key helpers
  image-cache.ts  # buildCachedImageUrl() / buildCachedImagePair() — canonical signed URL builder
  movie-images.ts # normalizeMovieImage(), normalizePosterUrl() — upstream field normalization
  vsembed.ts      # VSEmbed/Vidsrc URL construction
  runtime-env.ts  # Per-request env + cache-bypass flag storage

docs/
  DECISIONS.md            # Architectural decisions and anti-regression rules (read this first)
  FILE_MAP.md             # Task → file mapping + ripgrep search hints
  CLOUDFLARE_CACHE.md     # Cache behavior, TTLs, binding expectations
  DESIGN.md               # UI tokens, Tailwind palette, layout principles
  PAGINATION.md           # Netflix-style compact pagination algorithm
  METADATA_SNAPSHOTS.md   # Snapshot generation and caching
  video-buffering-policy.md
  navigation-active-state.md
  player-facade-qa.md / design-qa.md / metadata-spacing-qa.md  # Visual QA references
```

---

## Cloudflare bindings (wrangler.jsonc)

| Binding | Type | Purpose |
|---|---|---|
| `ASSETS` | Static | Serves `/_astro/*.css`, `/_astro/*.js` — **required**, must not be removed |
| `KV` | KV Namespace | Metadata cache (list, movie detail, search) |
| `WORKER_VERSION` | Version Metadata | Isolates HTML Cache API keys per deployment |
| `SEARCH_RATE_LIMITER` | Rate Limit | 60 requests/60 seconds on `/api/ophim/search` |

The `film-refresh` worker additionally binds an R2 bucket (`film-snapshots`) for snapshot exports.

---

## Key environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `IMAGE_CACHE_BASE_URL` | Server | `https://img.bluesia.net` — base for signed image URLs |
| `IMAGE_CACHE_SIGNING_SECRET` | Server secret | HMAC key for signing. Never prefix with `PUBLIC_`. |
| `PUBLIC_SNAPSHOT_BASE_URL` | Public | `https://data.bluesia.net` — pre-built metadata snapshots |
| `OPHIM_BASE_URL` | Server | OPhim API base (default: `https://ophim1.com`) |
| `ADMIN_REFRESH_TOKEN` | Server secret | Auth for `POST /api/admin/refresh` |
| `CACHE_REFRESH_TOKEN` | Server secret | Auth for HTML cache bypass (`?refresh=1&token=...`) |
| `HTML_CACHE_VERSION` | Server | Fallback only; production uses `WORKER_VERSION.id` |
| `VSEMBED_EMBED_BASE_URL` | Server | VSEmbed base (default: `https://vsembed.ru`) |

---

## Caching architecture

Three independent layers; do not conflate them:

1. **HTML Cache API** (`src/middleware.ts`): Edge HTML cache keyed on `WORKER_VERSION.id`. Each deployment automatically invalidates stale HTML. TTLs: 1800 s (home/list), 86400 s (short movie), 7776000 s (completed movie). Search/watch/favorites/history/settings are `no-store`.

2. **Metadata KV cache** (`lib/cache.ts`): Normalized OPhim payloads. TTLs: 1800 s (list/home), 86400 or 7776000 s (movie detail), 0 (search). Write budget uses daily keys `kvstats:writes:YYYY-MM-DD`; stable hash prevents redundant writes.

3. **Image cache** (`https://img.bluesia.net`): External VPS. This Worker only generates signed URLs — it has no R2 image binding. TTL is owned by `img.bluesia.net`.

---

## Image URL contract (critical invariant)

All active poster/backdrop rendering must use `lib/image-cache.ts`:
- `buildCachedImageUrl(normalizedUrl, variant)` — single URL
- `buildCachedImagePair(normalizedUrl)` — returns `{ m, d }` pair

**Only two variants**: `m` (mobile) and `d` (desktop). No width, quality, DPR, format, or AVIF parameters.

**URL format**: `https://img.bluesia.net/i/{m|d}/{sha256}.webp?url={encoded}&sig=v1.{hmac-hex}`

**Shared cache invariant**: `film.bluesia.net` (this repo) and `phim.bluesia.net` (Next.js) must generate **identical** cache keys for the same upstream image. The key is derived only from `sha256(normalizedUpstreamUrl)` + variant. Never include the requester domain, slug, route, or frontend-specific params.

**Responsive rendering**: Cards and detail pages must provide both `m` and `d` via `srcset`/`<picture>`. The default `src` fallback is always `d` (desktop), never `m`.

**Fallback chain** (when signing env vars are absent): signed URL → raw upstream URL → local placeholder. Do not fallback to a proxy endpoint.

**Do not reintroduce** the deleted `/api/image` proxy endpoint or `proxiedImage()`.

---

## Navigation rules

User hierarchy: **Category/List → `/movie/[slug]` (detail + player) → episode state**

- `/watch/[slug]` is a legacy redirect only. All new links must target `/movie/[slug]`.
- Category context persists via `returnTo=<encoded path+search>` query param, not hash fragments (hash unavailable during SSR).
- Episode changes use **replace navigation** (`location.replace`) so browser Back skips episode history and returns to the list page.
- Bottom nav active tab is derived from `returnTo` first, then pathname, then movie metadata fallback. Never default to `Trang chủ` for unknown direct-opened movie URLs.
- `BaseLayout.astro` owns the `data-nav-back` same-origin back handler.
- Anti-regression test: open a category → open a movie → select 3 episodes → press Back once → must land on the original category/list URL with the correct tab active.

---

## Playback rules

| Device | Source priority |
|---|---|
| Desktop / Android | iframe/embed first, then direct HLS |
| iOS | native HLS first, then iframe/embed fallback |
| MSE fallback | dynamic import `hls.js/dist/hls.light.js` only |

- `components/HlsVideo.tsx` owns OPhim direct HLS. Always uses the light hls.js build via dynamic import.
- `components/IframePlayerFacade.tsx` owns Vidsrc/VSEmbed embed. Never route Vidsrc through `HlsVideo.tsx`.
- `components/MoviePlayer.tsx` owns the "Xem phim" reveal — no autoplay on reveal.
- Unified source selection logic lives in `src/pages/movie/[slug].astro`.
- **Never proxy or re-chunk HLS/M3U8 through the Cloudflare Worker.** Video is browser-to-upstream only.
- Default HLS buffer: 60 s. Aggressive good-network cap: 300 s. Not a universal default.
- Do not show hls.js status/debug badges in production (e.g. `Sẵn sàng phát bằng hls.js`).
- `lib/vsembed.ts` constructs Vidsrc URLs. Do not modify Vidsrc flow when working on OPhim player changes.

---

## Data normalization

- `lib/ophim.ts` → `normalizeCard()` is the single source for mapping OPhim source payloads to `MovieCard`.
- `lib/movie-images.ts` → `normalizeMovieImage()` and `normalizePosterUrl()` handle upstream image field variations (`posterUrl`, `poster_url`, `poster`, `thumbUrl`, `thumb_url`, `thumb`, `thumbnail`, `image_url`, `image`) and rewrite legacy OPhim CDN hostnames to `img.ophim.live`.
- Do not duplicate shape mapping in UI components. Extend `normalizeCard()` and shared types in `lib/types.ts`.
- `lib/vsembed.ts` owns Vidsrc URL construction. `lib/spotlight.ts` owns hero carousel scoring.

---

## Editing conventions

- **Surgical changes**: Touch only what the task requires. Do not "improve" adjacent code, formatting, or comments.
- **No speculative abstractions**: No extra flexibility, configurability, or helper functions beyond what was asked.
- **Reuse before adding**: Check `lib/` for existing helpers before adding new ones. Check `docs/FILE_MAP.md` for the right file.
- **Match existing style**: Tailwind utility classes, lucide-react icons, `clsx`/`twMerge` for class merging.
- **No Node-only APIs**: Runtime is Cloudflare Workers/Pages. No filesystem I/O, no Node builtins unless covered by `nodejs_compat`.
- **No D1**: There is no D1 binding. Metadata lives in KV.
- **No R2 on main Worker**: The main `film` Worker has no R2 image binding. Image objects live on `img.bluesia.net`.
- **Never commit secrets**: `IMAGE_CACHE_SIGNING_SECRET`, `ADMIN_REFRESH_TOKEN`, `CACHE_REFRESH_TOKEN` are Cloudflare-managed secrets.
- **Don't change unrelated cache keys, TTLs, binding names, or version strings** unless the task explicitly requires it.
- **Preserve mobile-first shell**: `max-w-[720px]` app shell and bottom nav behavior are load-bearing UX.
- Shared poster card changes go in `components/MovieCard.tsx` so home/list/search/favorites/history stay consistent.

---

## Adaptive prefetch

`src/client/adaptivePrefetch.ts` tracks navigation transitions in `localStorage` (`filmbluesia_nav_stats_v1`). Thresholds: minimum 5 transitions, best-target probability ≥ 0.45. Prefetch runs after page load/idle, skips on `saveData` or `slow-2g`/`2g`.

**Never prefetch**: `/watch`, `/movie`, player/embed/playback paths, `.m3u8`, `.ts`, `.m4s`, `.mp4`.

Safe prefetch targets: category/list HTML + first-page `/api/ophim/list/[type]` API only.

---

## Lazy-loading rules

- Hero LCP image: `loading="eager"` + `fetchpriority="high"`. Never lazy-load it.
- All other posters/backdrops: `loading="lazy"` + `decoding="async"`.
- Critical islands (Hero, TopBar, BottomNav): `client:load`. Below-fold islands: `client:visible`. Background behavior: `client:idle`.
- Embed iframes load only after user clicks Play. Video preload: `metadata` at most.
- `hls.js` is a dynamic import triggered only when MSE fallback is actually needed.

---

## Working on common tasks

Before diving into code, run: `grep -n "term" src components lib` (or the search hints in `docs/FILE_MAP.md`).

| Task | Start here |
|---|---|
| Movie card / poster UI | `components/MovieCard.tsx` |
| Home hero / Smart Spotlight | `components/HeroSlider.tsx`, `lib/spotlight.ts` |
| Category lists / pagination | `src/pages/list/[type].astro`, `docs/PAGINATION.md` |
| Movie detail / player | `src/pages/movie/[slug].astro`, `components/MoviePlayer.tsx` |
| HLS playback | `components/HlsVideo.tsx`, `docs/video-buffering-policy.md` |
| Embed/Vidsrc playback | `components/IframePlayerFacade.tsx`, `lib/vsembed.ts` |
| Bottom nav / active tab | `components/BottomNav.tsx`, `src/layouts/BaseLayout.astro` |
| HTML caching | `src/middleware.ts`, `docs/CLOUDFLARE_CACHE.md` |
| Metadata caching / KV | `lib/cache.ts`, `lib/ophim.ts` |
| Image URLs / signing | `lib/image-cache.ts`, `lib/movie-images.ts` |
| OPhim data fetching | `lib/ophim.ts` |
| Cloudflare Worker entry | `src/worker.ts` |
| Hourly refresh cron | `src/worker-refresh.ts`, `wrangler-refresh.jsonc` |
| Navigation / returnTo | `src/layouts/BaseLayout.astro`, `docs/navigation-active-state.md` |
| Visual design tokens | `docs/DESIGN.md` |
| Visual QA references | `docs/design-qa.md`, `docs/player-facade-qa.md`, `docs/metadata-spacing-qa.md` |

---

## Verification checklist

After any code change:
1. `npm run build` — must pass (Astro compilation + TypeScript).
2. For image normalization changes: also run `npm run test:image-normalization`.
3. For UI changes: manually verify `MovieCard`, `SectionRow`, list/search/home, and mobile layout.
4. For home hero or broad visual changes: verify at both desktop and mobile viewports; update `docs/design-qa.md` if the reference visuals materially change.
5. For cache/runtime changes: review `src/middleware.ts`, `lib/cache.ts`, `lib/ophim.ts`, `src/worker.ts`, and `docs/CLOUDFLARE_CACHE.md`.
6. For navigation changes: run the anti-regression test (category → movie → multiple episodes → Back once → correct list + tab).

There are no lint or Jest scripts. Build is the only automated gate.

---

## Folders to avoid scanning

`node_modules`, `dist`, `.astro`, `.wrangler`, `.vite-cache-build`, `.verify-deps`
