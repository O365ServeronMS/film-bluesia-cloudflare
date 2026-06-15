# FilmBluesia Cloudflare

Astro + React movie catalog/streaming app deployed on Cloudflare Workers/Pages for `film.bluesia.net`.

## Image Proxy Troubleshooting

Movie posters and thumbnails are loaded through `/api/image`. The proxy only allows configured OPhim image sources and rejects arbitrary external domains.

Configure trusted OPhim image hosts with:

```env
IMAGE_ALLOWED_HOSTS=img.ophim1.com,img.ophim.live,img.ophim.cc
IMAGE_ALLOWED_HOST_SUFFIXES=.ophim.live,.ophim1.com,.ophim.cc
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

Expected behavior: allowed OPhim image URLs return `200` with an `image/*` content type and `Cache-Control: public, max-age=604800, stale-while-revalidate=86400`. Unknown hosts return `400` JSON with `IMAGE_HOST_NOT_ALLOWED` and short/no cache headers. Upstream `403`, `404`, or `5xx` responses should not be cached for more than 300 seconds.

To inspect current OPhim image hosts without changing the allowlist:

```powershell
npm run scan:image-hosts
```
