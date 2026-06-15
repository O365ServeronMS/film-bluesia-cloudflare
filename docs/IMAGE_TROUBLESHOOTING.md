# Image Proxy Troubleshooting

Movie posters and thumbnails are loaded through `/api/image`. The proxy only allows configured OPhim image sources and rejects arbitrary external domains.

Configure trusted OPhim image hosts with:

```env
IMAGE_ALLOWED_HOSTS=img.ophim1.com,img.ophim.live
IMAGE_ALLOWED_HOST_SUFFIXES=.ophim.live,.ophim1.com
```

When users report `No image`:

1. Check whether the source host is allowed:

```powershell
curl -i "https://film.bluesia.net/api/image?url=https%3A%2F%2Fimg.ophim.live%2Fuploads%2Fmovies%2Fsieu-quay-marsupilami-poster.jpg&profile=poster-desktop"
```

2. Compare with a known OPhim image host:

```powershell
curl -i "https://film.bluesia.net/api/image?url=https%3A%2F%2Fimg.ophim1.com%2Fuploads%2Fmovies%2Fsieu-quay-marsupilami-poster.jpg&profile=poster-desktop"
```

3. Confirm unknown domains are blocked:

```powershell
curl -i "https://film.bluesia.net/api/image?url=https%3A%2F%2Fexample.com%2Fposter.jpg&profile=poster-desktop"
```

Expected behavior: allowed OPhim image URLs return `200` with an `image/*` content type and `Cache-Control: public, max-age=604800, stale-while-revalidate=86400`. Unknown hosts return `400` JSON with `IMAGE_HOST_NOT_ALLOWED` and short/no cache headers. Upstream `403`, `404`, non-image, or `5xx` responses should not be cached for more than 300 seconds.

If the request URL differs from the logged candidate URL, check the `IMAGE_URL_RESOLVED` and `IMAGE_CANDIDATE_ATTEMPT` logs. The original `url` query param must be candidate `0`; later candidates are explicit mirror attempts and should never include `img.ophim.cc` unless that host was deliberately added to `IMAGE_ALLOWED_HOSTS` after verification.

An upstream `404` with `application/json` should log `IMAGE_UPSTREAM_NOT_FOUND`, not `IMAGE_OPTIMIZE_FAIL`. `IMAGE_OPTIMIZE_FAIL` means a valid `200 image/*` origin response reached the Cloudflare image transform step and the transform failed or returned unusable output.

If Cloudflare shows `outcome=canceled`, compare the same request's lifecycle logs by `requestId`: `IMAGE_REQUEST_START`, `IMAGE_CACHE_MISS`, `IMAGE_CANDIDATE_ATTEMPT`, `IMAGE_ORIGIN_FETCH_DONE`, `IMAGE_OPTIMIZE_SUCCESS`, `IMAGE_CACHE_PUT_SUCCESS`, and `IMAGE_RESPONSE_SENT`. Missing `IMAGE_RESPONSE_SENT` usually means the request was canceled before the Worker finished writing the response.

To inspect current OPhim image hosts without changing the allowlist:

```powershell
npm run scan:image-hosts
```
