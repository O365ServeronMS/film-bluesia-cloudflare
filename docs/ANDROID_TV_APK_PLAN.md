# Bluesia Cinema Android TV APK Plan

## 1. Goal and fixed identity

Build a sideloadable and release-signable APK for Sony Android TV televisions, designed for a 16:9 screen viewed at TV distance. The 65-inch size does not require device-specific code; resolution, density, overscan-safe spacing, remote focus, and 10-foot readability are the relevant constraints.

- Product name: **Bluesia Cinema**
- Android application ID: `net.bluesia.film.tv`
- Android namespace: `net.bluesia.film.tv`
- Gradle root project: `BluesiaCinemaTV`
- Android module: `tv-app`
- Initial version: `versionCode = 1`, `versionName = "1.0.0"`
- Production URL: `https://film.bluesia.net`
- Minimum Android version: API 23 initially; raise only if a real dependency requires it
- Compile/target SDK: latest stable SDK supported by the selected stable Android Gradle Plugin; pin exact versions in the repository
- Orientation: landscape only

Do not rename the existing npm package, Cloudflare Worker, domain, cache keys, or browser local-storage keys.

## 2. Recommended architecture

Use a small native Kotlin Android TV shell containing one hardened WebView. Keep Astro/React/Cloudflare as the catalog, metadata, navigation, image, and playback application.

Why this is the first implementation:

- It reuses the current production application and signed image-cache contract.
- It preserves the existing Android playback priority: embed/iframe first, then direct HLS fallback.
- It avoids maintaining a second OPhim client, cache model, and movie UI in Kotlin.
- It can produce a testable APK quickly while still providing native remote, back, fullscreen, network-error, and lifecycle behavior.

Do not use a Trusted Web Activity for the first release. It depends more heavily on an installed browser and gives less control over TV remote keys, fullscreen video, and error handling. Do not proxy HLS segments through the APK or Cloudflare.

Expected layout:

```text
film-bluesia-cloudflare/
  tv-app/                         Android application module
    build.gradle.kts
    proguard-rules.pro
    src/main/
      AndroidManifest.xml
      java/net/bluesia/film/tv/
        MainActivity.kt
        TvWebViewClient.kt
        TvWebChromeClient.kt
      res/
        drawable/
        mipmap-*/
        values/
        xml/network_security_config.xml
  build.gradle.kts
  settings.gradle.kts
  gradle.properties
  gradle/libs.versions.toml
  gradlew / gradlew.bat
```

## 3. Phase 0 — prerequisites and decisions

1. Confirm the exact Sony TV model and Android TV/Google TV OS version in **Settings > System/About**.
2. Confirm that sideloading is acceptable. Google Play TV publication adds store listing, review, target-SDK, privacy, and Android App Bundle requirements.
3. Confirm whether playback embeds work in the TV's current Chrome/WebView. This is a release gate because third-party embed providers may block WebView, cookies, or TV user agents.
4. Decide release channels:
   - Development: debug APK installed with ADB.
   - Household/internal: signed release APK distributed privately.
   - Public Play Store: signed AAB plus an optional universal APK for sideload testing.
5. Preserve the requirement that opening the player does not autoplay and the iframe is created only after a separate Play action.

## 4. Phase 1 — install the Windows toolchain

### Required software

1. Install the latest stable **Android Studio** for Windows from the official Android developer site. Use its bundled JetBrains Runtime; do not install a separate JDK unless Gradle reports a compatibility requirement.
2. In Android Studio **SDK Manager**, install:
   - Latest stable Android SDK Platform.
   - Android SDK Build-Tools matching that platform.
   - Android SDK Platform-Tools (`adb`).
   - Android SDK Command-line Tools (latest).
   - Android Emulator.
   - One Google TV or Android TV x86_64 system image for the chosen API level.
3. In **Device Manager**, create a TV virtual device, preferably 1080p. Add a 4K profile only for layout/performance validation.
4. Keep the Gradle wrapper in source control. Do not require a globally installed Gradle.
5. Existing Node/npm tooling remains unchanged; use `npm.cmd` for web commands.

### Environment setup

Typical SDK path:

```powershell
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:Path += ";$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin"
```

Persist those variables through Windows Environment Variables after validating the path. If command-line Gradle cannot locate Java, point `JAVA_HOME` to Android Studio's bundled `jbr` directory.

Accept SDK licences and verify the installation:

```powershell
sdkmanager.bat --licenses
java -version
adb version
sdkmanager.bat --list_installed
```

Record the installed Android Studio, JDK, SDK Platform, Build-Tools, Android Gradle Plugin, Gradle, and Kotlin versions in this document when implementation starts. Avoid floating dependency versions.

## 5. Phase 2 — create the Android TV project

1. Create an **Empty Views Activity** project in the repository, using Kotlin and Gradle Kotlin DSL.
2. Use package/namespace `net.bluesia.film.tv` and module directory `tv-app`.
3. Select API 23 as `minSdk` unless Phase 0 shows all target TVs can support a higher floor.
4. Pin repositories to `google()` and `mavenCentral()` only unless a reviewed dependency requires another source.
5. Add only the necessary AndroidX dependencies. The MVP does not need Compose, Leanback fragments, Retrofit, or Media3.
6. Configure Java/Kotlin toolchains to the version required by the selected stable Android Gradle Plugin.
7. Add `.idea` user state, `local.properties`, APKs, AABs, keystores, and signing property files to `.gitignore`.
8. Keep `gradle-wrapper.properties`, version catalog, and all Android source/resources tracked.

Initial build gates:

```powershell
.\gradlew.bat tasks
.\gradlew.bat assembleDebug
```

## 6. Phase 3 — Android TV manifest and assets

Configure `AndroidManifest.xml` with:

- `android.permission.INTERNET` and `android.permission.ACCESS_NETWORK_STATE`.
- `android.software.leanback` with `required="true"` for a TV-only APK.
- `android.hardware.touchscreen` with `required="false"`.
- Main activity categories `LEANBACK_LAUNCHER` and `DEFAULT`; do not advertise a phone launcher unless phone support is intentionally added.
- Landscape orientation.
- A TV banner (`android:banner`) with readable branding at the Android TV launcher banner aspect/size.
- App icon and adaptive icon derived from the existing Bluesia assets, with safe padding.
- A dark TV theme, no action bar, and no light status/navigation flash.
- `usesCleartextTraffic="false"`; production navigation must remain HTTPS.

Set a deliberate backup policy. Browser history/favorites may contain user viewing data, so disable cloud backup for the MVP unless a privacy-reviewed migration strategy exists.

## 7. Phase 4 — native shell implementation

### Activity and lifecycle

1. Build a single `MainActivity` containing the WebView, loading `https://film.bluesia.net/?platform=android-tv`.
2. Enable DOM storage, JavaScript, media playback, and cookies only to the extent required by the site and embed providers.
3. Set `mediaPlaybackRequiresUserGesture = true` to enforce the no-autoplay policy.
4. Disable file access, content access, universal file URL access, and WebView debugging in release builds.
5. Enable WebView debugging only when `BuildConfig.DEBUG` is true.
6. Preserve WebView state across configuration/lifecycle recreation and pause/resume timers appropriately.
7. Show a native offline/error screen with **Retry** and **Exit**, rather than a blank WebView error page.
8. Use the normal Android user agent with a small `BluesiaCinemaTV/<version>` suffix. Do not impersonate desktop Safari or iOS.

### Navigation and URL security

1. Keep `film.bluesia.net` navigation inside the WebView.
2. Allow explicitly reviewed playback embed hosts inside the WebView because current playback uses them.
3. Open other HTTPS links through an external intent only when a matching handler exists; reject non-HTTP(S) schemes by default.
4. Never ignore TLS errors. Reject certificate failures.
5. Do not add a JavaScript bridge for the MVP. If one is later required, expose the smallest possible API only to the exact first-party origin.
6. Android Back behavior:
   - Exit custom fullscreen first.
   - Then use WebView history when available.
   - Otherwise require a second Back press or show an exit confirmation.

### Fullscreen playback

1. Implement `WebChromeClient.onShowCustomView` and `onHideCustomView` for HTML5/iframe fullscreen.
2. Hide system bars in fullscreen and restore them reliably on exit, Back, pause, and activity destruction.
3. Forward permission requests only after origin and resource checks. The movie app should not grant camera or microphone access.
4. Test cookies, third-party cookies, iframe loading, fullscreen, redirects, subtitles, and quality controls for every active embed provider.
5. If embeds are incompatible with WebView, do not weaken WebView security. Promote a native Media3 HLS player to Phase 8 and keep the server-provided source priority explicit.

## 8. Phase 5 — add a real TV mode to the web app

The existing mobile-first `max-w-[720px]` shell is not suitable as the primary 65-inch TV UI. Add an explicit TV mode detected from `platform=android-tv`, then persist it for same-origin navigation. Do not rely only on user-agent sniffing.

Required TV changes:

1. Add a body/data attribute such as `data-platform="android-tv"` during the first render or immediately before paint.
2. Expand the TV shell to a widescreen maximum or full width while retaining the existing 720px layout for browsers.
3. Apply 5% overscan-safe outer spacing and verify no focused item is clipped.
4. Use TV-readable typography and controls: approximately 24sp-equivalent body text, 32–48sp headings, and at least 48dp targets with larger visual focus rings.
5. Replace hover-dependent behavior with visible focus states.
6. Make every actionable element keyboard/D-pad reachable in a logical order. No focus traps inside rows, menus, episode selectors, or the player facade.
7. Implement deterministic spatial focus for horizontal movie rows and retain focus when returning from details.
8. Scroll the focused card into view without large motion. Respect reduced-motion preferences.
9. Map remote keys:
   - D-pad: move focus.
   - Center/Enter: activate.
   - Back: close modal/player/menu first, then navigate back.
   - Play/Pause: control media only when a player is active.
10. Provide a visible initial focus target after every route load.
11. Hide or redesign mobile bottom navigation in TV mode; use a top/side navigation pattern reachable by D-pad.
12. Keep poster/backdrop lazy-loading rules, signed `m`/`d` image pairs, and `d` fallback intact. TV mode should use the desktop image variant, not introduce a third variant.
13. Preserve `/movie/[slug]` as the canonical playback route and `returnTo` navigation context.
14. Keep `lib/playback.ts` as the web source-selection authority. Android TV should continue through the Android branch: iframe first, HLS fallback.

Add focused unit tests for TV-mode detection and navigation helpers if a lightweight test runner is introduced. Avoid adding a broad framework solely for one test.

## 9. Phase 6 — debug build and emulator validation

Build and install:

```powershell
.\gradlew.bat clean assembleDebug
adb install -r .\tv-app\build\outputs\apk\debug\tv-app-debug.apk
adb shell am start -n net.bluesia.film.tv/.MainActivity
adb logcat
```

Emulator test matrix:

- Cold launch, warm launch, process recreation, offline launch, and reconnect.
- 1080p and 4K TV profiles.
- D-pad traversal of home, search, lists, pagination, movie detail, server/episode selection, favorites, history, and settings.
- Back behavior from each screen and from fullscreen.
- Embed-first playback, HLS fallback, no autoplay, fullscreen enter/exit, pause/resume, subtitles, quality selection, and fatal-source recovery.
- Local storage persistence across app upgrades.
- No mixed content, certificate bypass, unexpected external intents, console errors, or inaccessible focus states.
- Memory stability during at least one full movie-length soak test or a representative multi-hour loop.

Run the web build after web changes:

```powershell
npm.cmd run build
```

## 10. Phase 7 — test on the Sony TV

1. Put the workstation and TV on the same trusted network.
2. Enable Developer options by repeatedly selecting the TV build number, then enable USB/network debugging as supported by that Sony firmware.
3. Note the TV IP address. Pair/connect using the method exposed by that OS version:

```powershell
adb pair <TV_IP>:<PAIRING_PORT>
adb connect <TV_IP>:<ADB_PORT>
adb devices
adb install -r .\tv-app\build\outputs\apk\debug\tv-app-debug.apk
```

Older Android TV firmware may expose legacy `adb connect <TV_IP>:5555` without wireless pairing. Use only the method shown by the TV and disable network debugging after testing.

Physical-device acceptance criteria:

- Launcher banner and icon render correctly.
- First meaningful screen is usable within an agreed launch-time budget.
- Text is readable from the normal seating distance.
- All edges remain safe with TV overscan/display-area settings.
- Every action works with the Sony remote; no mouse/touch is required.
- Focus remains visible against all posters/backdrops.
- 1080p/4K video fills the screen correctly without stretching.
- Audio, captions, fullscreen, Back, Home, sleep/wake, Wi-Fi loss, and app resume behave correctly.
- At least three representative movies and three series episodes are tested across available source providers.

## 11. Phase 8 — native HLS fallback if WebView embeds fail

This phase is conditional, not part of the initial APK.

1. Add AndroidX Media3 ExoPlayer and an Android player activity.
2. Expose a narrowly scoped first-party endpoint or WebView-to-native handoff containing only validated playback metadata. Do not scrape rendered HTML.
3. Preserve source policy: request embed playback first on Android; enter native HLS only after embed failure or explicit source selection.
4. Validate source URLs and allow only HTTP(S). Do not send video through the Cloudflare Worker.
5. Use conservative buffering comparable to the web defaults; a five-minute buffer is only an upper cap for a confirmed good network.
6. Add TV transport controls, caption tracks, audio tracks, quality selection, retry/recovery, and lifecycle-safe playback state.
7. Document how this native path remains consistent with `lib/playback.ts`; avoid silently creating two conflicting source-selection policies.

## 12. Phase 9 — release signing and artifacts

1. Generate a dedicated upload/release keystore once. Store it outside Git and in two encrypted backups.
2. Never commit the keystore, passwords, `keystore.properties`, or signing environment variables.
3. Load release credentials from an ignored local properties file or CI secrets.
4. Enable R8/resource shrinking only after testing that WebView/fullscreen behavior is unchanged.
5. Build both artifacts as required:

```powershell
.\gradlew.bat clean lintRelease testReleaseUnitTest assembleRelease bundleRelease
```

6. Verify the APK before distribution:

```powershell
apksigner.bat verify --verbose --print-certs .\tv-app\build\outputs\apk\release\tv-app-release.apk
```

7. Archive the mapping file, version metadata, checksums, and release notes alongside each release artifact, but not signing secrets.
8. Install the exact signed release APK on the Sony TV and repeat the critical playback/navigation tests; debug success is not sufficient.

## 13. Phase 10 — Play Store option

For Google Play TV distribution:

1. Upload the AAB, not the APK.
2. Configure Play App Signing and keep the upload key protected.
3. Supply TV banner, icon, screenshots, feature graphic, description, privacy policy, content rating, data-safety declaration, and support contact.
4. Meet the target API level enforced on the actual submission date.
5. Confirm content and streaming rights before public distribution.
6. Use internal testing first, then closed testing, then production rollout.
7. Verify that Play classifies the build as Android TV compatible and that no touchscreen/phone-only feature excludes Sony devices.

## 14. CI and maintenance

1. Add a separate Android CI job that runs Gradle lint, unit tests, and debug/release compilation without exposing signing material to pull requests.
2. Keep the web and Android pipelines independent: Android packaging should not deploy Cloudflare, and `npm.cmd run deploy` must remain explicit.
3. Pin and update Gradle, Android Gradle Plugin, Kotlin, SDK, and AndroidX versions deliberately; test upgrades on the emulator and Sony TV.
4. Monitor WebView regressions because the system WebView/Chrome updates independently from the APK.
5. Add a small in-app diagnostics screen or version footer showing app version, WebView version, Android version, and current origin, without secrets.
6. Define an update strategy: Play-managed updates for store releases or a documented manual sideload replacement for private releases.

## 15. Definition of done

The first release is complete when:

- `assembleRelease` and `bundleRelease` pass from a clean checkout with documented prerequisites.
- The APK is correctly signed and its application ID is `net.bluesia.film.tv`.
- It appears in the Sony TV launcher as **Bluesia Cinema** with a correct banner.
- The complete app is operable with only the Sony remote.
- TV mode is readable, widescreen, overscan-safe, and has deterministic visible focus.
- Embed-first playback and HLS fallback follow the existing policy, never autoplay, and support fullscreen/Back correctly.
- No video is proxied or re-chunked by the APK or Cloudflare Worker.
- Network/TLS errors fail safely and no broad JavaScript bridge or insecure URL handling exists.
- Debug and signed release APKs pass the emulator and physical Sony TV matrices.
- Tool versions, build commands, signing procedure, and remaining provider limitations are documented.

## 16. Recommended execution order

1. Confirm Sony model/OS and test WebView compatibility.
2. Install and verify Android Studio/SDK/ADB.
3. Scaffold the Kotlin TV module and build a blank debug APK.
4. Implement secure WebView, Back, errors, and fullscreen.
5. Implement web TV mode and D-pad focus.
6. Test on emulator, then on the physical Sony TV.
7. Add native Media3 fallback only if measured embed incompatibility requires it.
8. Configure release signing, produce APK/AAB, and run release acceptance tests.
9. Add CI and choose private sideload or Play Store distribution.
