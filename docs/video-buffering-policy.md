# Video Buffering Policy

## Scope

- M3U8/HLS chunking is handled by upstream playlist segments.
- FilmBluesia intentionally does not implement Worker-side video chunking.
- Cloudflare Worker must not proxy full video streams.
- The app must not download, transcode, persist, or re-distribute third-party video segments.

## Playback Optimization

- Playback acceleration is handled in the browser through client-side buffer tuning, retry behavior, lazy loading, native HLS fallback, and hls.js error recovery.
- HLS playback is hls.js-first for MSE-capable browsers, with native HLS fallback for iOS/Safari or unsupported MSE cases, to keep desktop browser playback behavior consistent without breaking iOS native playback.
- hls.js is loaded dynamically only for direct M3U8 playback inside the watch/player path.
- Production HLS UI must not expose hls.js readiness/debug/status badges. Keep the dynamic quality selector from `hls.levels` and the yellow local subtitle upload button.
- The default buffer target is 60 seconds.
- Aggressive buffering may target up to 180 seconds only when the browser reports a good network condition and `saveData` is not enabled.
- The maximum buffer cap for aggressive mode is 300 seconds.
- A 5-minute buffer is not used as a universal default because it increases bandwidth and memory usage for users who may never watch far enough ahead.

## Future Hosted Video

- If the project later hosts video in R2, HTTP Range request support must be implemented separately.
- R2-hosted video range handling is separate from external M3U8/HLS playback and must not be confused with proxying third-party streams.
