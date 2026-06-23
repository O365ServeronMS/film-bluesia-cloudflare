# Security Review: film-bluesia-cloudflare

## Scope

- Repository-wide Codex Security scan of 62 in-scope source, configuration, route, component, and script files; all 62 have completion receipts.
- The scan began at commit `9acd4cc3ac60` and was reconciled against current commit `e4840d34ce026f429e94b2b6b6ef5e0e3b9b0746` plus the security-fix working tree.
- Reviewed Cloudflare Worker dispatch and caching, Astro routes and rendering, OPhim ingestion, image signing, playback selection, browser storage, secrets/configuration, parsers, navigation, and production dependencies.
- The threat model was generated during Phase 1 from repository code and project instructions; it was not an external input.
- Validation used source tracing, deterministic harnesses, bounded OPhim probes, and local Wrangler/Miniflare HTTP reproduction. No production mutation or load test was performed.
- Generated output and dependency trees (`dist`, `.astro`, `.wrangler`, Vite caches, and `node_modules`) were excluded except where built output or dependency metadata was needed for validation.
- Visual browser QA was unavailable because the browser integration rejected the invocation before launch; HTTP-level Worker verification completed instead.

### Scan Summary

| Field | Value |
|---|---|
| Reportable findings | 2 |
| Severity mix | 2 medium |
| Confidence mix | 2 high |
| Coverage | 62/62 in-scope files reviewed |
| Validation mode | Source trace, deterministic harness, bounded upstream probes, local Worker HTTP reproduction |
| Fix status | Both reportable findings fixed and locally verified in the working tree |

Primary supporting artifacts are under `artifacts/01_context`, `artifacts/02_discovery`, `artifacts/03_coverage`, `artifacts/04_reconciliation`, and `artifacts/05_findings` in this scan directory. Candidate-specific ledgers contain discovery, local validation, local attack-path, formal validation, and attack-path receipts.

## Threat Model

### System and assets

FilmBluesia is a public Astro and React movie catalog/player deployed as a Cloudflare Worker. It fetches OPhim metadata, renders catalog and unified movie/playback pages, signs external image-cache URLs, and stores server metadata in Cache API/KV-compatible storage. Browser-only user state lives in `localStorage`.

Assets requiring protection are shared HTML cache integrity, Worker availability and quotas, signing secrets, deployment configuration, navigation integrity, and safe browser playback boundaries.

### Trust boundaries and attacker model

- Internet users control routes, query parameters, headers including `User-Agent`, and public API calls.
- OPhim and playback-provider metadata cross external-provider trust boundaries before rendering or iframe/HLS use.
- `img.bluesia.net` is a separate signed image-fetch service whose implementation was not in scope.
- Cloudflare Cache API, KV, R2, environment bindings, and assets form deployment/runtime boundaries.
- The ordinary attacker is unauthenticated and cannot directly write trusted provider metadata or deployment secrets.

### Security invariants

- Shared HTML cache keys must include every input that changes server-rendered content, or variant responses must not enter shared cache.
- Public request parameters must be finite and bounded before they control upstream result size or per-item normalization/signing work.
- Signing secrets remain server-side, and signed image URLs must not create an unchecked internal-network fetch path.
- Playback URL validation and device/source selection remain centralized; player reveal does not autoplay, and iframes load only after explicit Play.
- Admin refresh operations require a nonempty secret; navigation return targets remain same-origin paths.

## Findings

| # | Finding | Severity | Confidence | Status |
|---:|---|---|---|---|
| 1 | [Shared movie HTML cache key omitted playback and device variants](#1-shared-movie-html-cache-key-omitted-playback-and-device-variants) | medium | high | Fixed in working tree |
| 2 | [Unbounded search limit amplified Worker normalization and signing](#2-unbounded-search-limit-amplified-worker-normalization-and-signing) | medium | high | Fixed in working tree |

### Confidence Scale

| Label | Meaning |
|---|---|
| high | Direct source, configuration, or runtime evidence supports the finding, with no material unresolved reachability or exploitability blocker. |
| medium | Source evidence supports a plausible issue, but runtime behavior, deployment configuration, role reachability, type constraints, or exploit reliability still need proof. |
| low | Weak or incomplete evidence; retained only as an explicit follow-up candidate. |

### [1] Shared movie HTML cache key omitted playback and device variants

| Field | Value |
|---|---|
| Severity | medium |
| Confidence | high (0.95) |
| Confidence rationale | A fresh local Worker reproduced a miss/write/hit sequence in which conflicting requests received byte-identical attacker-selected HTML; the repaired policy was then verified over HTTP. |
| Category | Web cache poisoning / cache-key confusion |
| CWE | CWE-444: Inconsistent Interpretation of HTTP Requests |
| Affected lines | `src/middleware.ts:79-110`, `src/middleware.ts:190-216`, `src/pages/movie/[slug].astro:19-55` |

#### Summary

The movie renderer consumed attacker-controlled `server`, `ep`, `player`, `mirror`, and `play` parameters and varied playback choice by `User-Agent`, while the shared HTML cache key retained only `returnTo`. The first public request could therefore populate a long-lived movie-page cache entry with its playback state, and later users received that state. Explicit user interaction still prevented forced autoplay, limiting impact to cross-user page/playback integrity.

#### Validation

- Traced public query parameters and `User-Agent` through `src/pages/movie/[slug].astro` into the rendered player state.
- Traced middleware canonicalization into `caches.default.put()`.
- A fresh Wrangler/Miniflare session returned `HTML_CACHE_MISS` then `HTML_CACHE_HIT` for conflicting requests under the same key; both 39,669-byte bodies had the same SHA-256 and contained the first request's playback markers.
- After repair, the playback-bearing request returned `Cache-Control: no-store` and `X-Film-Bluesia-Cache: HTML_CACHE_BYPASS_PLAYBACK_VARIANT`; its body differed from the plain iOS response. Mobile and desktop default requests occupied separate variants.
- Remaining uncertainty is limited to production POP residency and eviction timing; the vulnerable key/write behavior itself was directly reproduced.

#### Dataflow

Unauthenticated movie query and spoofable `User-Agent` -> movie route playback selection -> server-rendered player props -> middleware's collapsed canonical key -> shared Cache API write -> later victim cache hit.

#### Reachability

Any unauthenticated visitor could request a known movie slug with playback parameters. No account, secret, or privileged network position was required. Exploitation required winning the initial cache fill or a later eviction window, after which other users of the same slug could receive the poisoned playback selection/open state.

#### Severity

Final severity is medium. The path was public, realistic, and validated end to end, with a long shared TTL and cross-user integrity impact. Impact was narrower than high severity because it did not expose private data, cross an authenticated boundary, execute script in the first-party origin, or force media autoplay. Evidence of script execution, credential exposure, or a privileged same-origin action would raise severity; proof that production never shares these Cache API entries would lower it.

#### Remediation

Implemented: playback-bearing movie requests bypass shared HTML cache with `no-store`, and ordinary movie keys include a centralized mobile/desktop playback-device dimension. Keep the two-request poisoning regression and the mobile/desktop cache-variant test. Any future server-rendered parameter must either enter the key or force cache bypass.

### [2] Unbounded search limit amplified Worker normalization and signing

| Field | Value |
|---|---|
| Severity | medium |
| Confidence | high (0.88) |
| Confidence rationale | Direct route tracing, bounded upstream probes, and a fixture-backed harness proved that an unauthenticated limit expanded processing from 24 to 500 items and increased measured route time. |
| Category | Uncontrolled resource consumption |
| CWE | CWE-400: Uncontrolled Resource Consumption |
| Affected lines | `src/pages/api/ophim/search.ts:7-9`, `lib/ophim.ts:419-427` |

#### Summary

The public search route converted `page` and `limit` with `Number()` and forwarded them without a finite positive maximum. OPhim accepted up to 500 results, and the Worker normalized every card and could produce four signed image variants per item. Unique query combinations could avoid metadata-cache reuse, allowing repeated requests to amplify upstream bytes and Worker work.

#### Validation

- Bounded OPhim probes showed 24 items/48,280 bytes for the normal limit and 500 items/674,720 bytes when requesting 1,000.
- A fixture-backed harness invoking the original route processed 24 items in 33.36 ms versus 500 items in 118.13 ms, a 20.8x item increase and 3.54x measured route-time increase.
- The upstream 500-item cap bounded a single request but did not enforce the application's normal policy; no repository rate limit defeated repeated uncached calls.
- After repair, a deterministic test proves page is at least 1 and limit is clamped to 12..64 before the upstream URL is built.
- Deployed CPU duration, account-level bot controls, and billing impact remain unknown; no service was load-tested.

#### Dataflow

Unauthenticated `/api/ophim/search` query -> numeric parsing -> `searchMovies()` -> OPhim URL result size -> `Promise.all(items.map(normalizeCard))` -> image normalization/signing -> JSON response.

#### Reachability

Any internet user could call the no-store search API. Repeated broad keywords and distinct parameter combinations were needed for sustained availability impact. OPhim's cap prevented unbounded memory growth per request but still allowed substantially more work than intended.

#### Severity

Final severity is medium. The endpoint was unauthenticated and the amplification was measured, but the per-request impact was bounded at 500 items and a production denial of service was not demonstrated. Evidence of Worker CPU-limit failures, material cost growth, or bypass of deployed rate controls would raise severity; evidence of an effective edge rate limit that constrains the route would lower it.

#### Remediation

Implemented: `searchMovies()` now normalizes page to at least 1 and clamps limit to 12..64 before constructing the upstream request, then uses the safe values in pagination fallbacks. Retain malformed, negative, infinite, and oversized input tests; consider route-level rate limiting as defense in depth.

## Empty-Page Regression

The production home page returned HTTP 200 with a cache hit but contained no hero items and only navigation chrome. The failure chain was: valid upstream metadata -> KV `put()` quota/failure throws -> all settled HOME source requests become rejections -> `getHome()` converts them to empty sections -> middleware caches the empty 200 response.

The working-tree fix makes metadata-cache writes and write-budget persistence best-effort, while preserving valid upstream data. `getHome()` now throws whenever all eight catalog sources produce zero movies, including all-fulfilled empty responses, so middleware cannot cache an empty successful home page. A deterministic test covers both KV quota failure and the all-zero guard.

Local Worker verification after the fix returned HTTP 200 with 278,897 bytes and 58 movie links. The production site still requires deployment of this working tree; the deployment-scoped `WORKER_VERSION` should invalidate the poisoned HTML cache key.

## Reviewed Surfaces

| Surface | Risk Area | Outcome | Notes |
|---|---|---|---|
| Worker middleware and Cache API | Shared HTML integrity | Reported | Cache-key confusion became finding 1 and is fixed in the working tree. |
| Public OPhim search | Resource exhaustion | Reported | Unbounded limit became finding 2 and is fixed in the working tree. |
| HOME image signing | SSRF via signed external image cache | Needs follow-up | Arbitrary HTTP(S) metadata URLs can be signed; external fetch, redirect/DNS/final-IP, egress controls, and ordinary-attacker metadata write path were unavailable. |
| Movie image signing | SSRF via signed external image cache | Needs follow-up | Same external-service and attacker-control proof gap; kept as a separate route instance. |
| Search image signing | SSRF via signed external image cache | Needs follow-up | Same external-service and attacker-control proof gap; kept as a separate route instance. |
| Third-party playback iframe | Cross-origin content boundary | Rejected | User activation and trusted-provider control are required; same-origin policy blocks parent access and no privileged parent API was identified. |
| Astro Host-header advisory path | Dependency SSRF | Rejected | Required custom prerendered error route was absent; current dependencies are outside the affected versions. |
| Admin refresh/status routes | Authentication/authorization | No issue found | Exact nonempty server secret and method checks protect mutable operations. |
| OPhim destination selection | Worker SSRF | No issue found | Request input does not select the configured upstream origin. |
| Rendering and browser DOM APIs | XSS | No issue found | Framework escaping is retained; no raw HTML or eval-like sink survived review. |
| Navigation return targets | Open redirect/script URL | No issue found | Same-origin path validation constrains navigation. |
| Secrets and deployment config | Secret exposure | No issue found | No committed secret value or browser rendering path was found. |
| File APIs and database query classes | Traversal/injection | Not applicable | Deployed code has no attacker-selected filesystem API or database/query engine. |

A matching, slightly expanded coverage view is stored at `artifacts/03_coverage/repository_coverage_ledger.md`; the deterministic work ledger contains 62 file receipts.

## Open Questions And Follow Up

- Review the `img.bluesia.net` implementation for the three deferred image-signing instances, specifically URL allowlisting, redirect revalidation, DNS rebinding, final resolved IP checks, private/link-local address blocking, and egress restrictions.
- After deploying the working tree from `e4840d34ce026f429e94b2b6b6ef5e0e3b9b0746`, repeat the cache-bypass and device-variant probes against a non-production preview and confirm existing production HTML cache entries are invalidated by the deployment-scoped `WORKER_VERSION`.
- Verify deployed Cloudflare rate-limiting/bot policy for `/api/ophim/search`; the repository fix bounds per-request work but does not replace edge abuse controls.
- Re-run a production dependency audit in an approved network context. The local dependency versions were upgraded, but the post-upgrade registry audit was skipped because external package-metadata disclosure was not approved.
