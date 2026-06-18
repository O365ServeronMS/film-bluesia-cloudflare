**Source visual truth**

- `C:\Users\X\AppData\Local\Temp\codex-clipboard-9efa4ec7-2813-4c6c-b5cd-b89b21633b13.png`
- Viewport: 758 × 950
- State: movie detail page, synopsis collapsed, player closed

**Implementation evidence**

- Route: local `/movie/michael`
- Implementation screenshot: unavailable because the in-app browser could not start in the Windows sandbox.
- Render check: HTTP 200; episode controls render before the synopsis marker; synopsis toggle is present.

**Full-view comparison evidence**

- Blocked: no implementation screenshot could be captured at the source viewport.

**Focused region comparison evidence**

- Blocked: the episode, synopsis, cast, and director region could not be captured for visual comparison.

**Findings**

- [P2] Visual responsive QA remains unverified.
  Location: movie detail content below the player.
  Evidence: build and rendered HTML checks pass, but there is no same-viewport screenshot.
  Impact: spacing, two-line truncation, and iOS landscape presentation still need a visual browser pass.
  Fix: capture the local detail route at 758 × 950 and an iOS landscape viewport, test “Xem thêm/Thu gọn”, then compare against the source.

**Patches made**

- Moved the episode list above descriptive metadata.
- Added a two-line synopsis clamp with an accessible expand/collapse control.
- Added director metadata below the synopsis beside cast metadata.
- Set `text-size-adjust: 100%` and `-webkit-text-size-adjust: 100%` globally.

**Implementation checklist**

- [x] Production build succeeds.
- [x] Rendered route returns HTTP 200.
- [x] Episode marker precedes synopsis marker.
- [x] Synopsis toggle is rendered.
- [ ] Complete same-viewport visual comparison.
- [ ] Complete iOS landscape visual and interaction check.

**Follow-up polish**

- None classified until visual capture is available.

final result: blocked
