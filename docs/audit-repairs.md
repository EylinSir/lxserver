# Code audit repairs

## Requirements

Preserve intentional public playback, authenticated personal libraries, explicit administrator-approved native-VM sources, saved audio settings, and Media Session lyric metadata. Reject access outside a user's identity or managed filesystem root. Keep every change independent of a particular deployment.

## Implementation

- `security.ts` centralizes cookie decoding, source-owner normalization, filesystem containment (including existing symlink ancestors), and public upstream address validation.
- Download proxy authentication respects public mode. Each outbound request and redirect resolves and validates the upstream; connections use that validated address rather than repeating DNS resolution. Embedded remote artwork follows the same boundary with a size limit and timeout; cached artwork uses the authenticated local accessor.
- Source handlers authorize the requested owner before filesystem changes, fetching scripts, or executing scripts. Native VM execution requires administrator approval and no longer occurs as an implicit fallback from safe mode.
- Account deletion, rename, and password changes invalidate account credentials (including stored API tokens); clients must sign in or issue a new API token afterward. Authentication independently rejects sessions for missing users.
- Startup migrates the legacy `frontend.password` administrator credential before filtering configuration keys, preserving an explicitly configured `admin.password`. Configuration-file environment overrides are redacted in startup logs.
- Cached media uses a shared file sender with validated ranges, HEAD handling, and stream cleanup. File-manager errors reject targets instead of falling back to the root.
- Download jobs share a real completion promise only within one destination. Progress keys include the user; resumed queue tasks wait for cancelled runs to unwind.
- Playlist ordering ignores stale/duplicate IDs; remote playlist metadata is escaped. Cover fetch timeouts remain active until the body is consumed.
- Service workers only evict their own cache family and return a response for offline misses.
- Safari has an availability-aware AirPlay picker and route-state indication. Native Safari/mobile playback is preserved until DSP is explicitly requested. Wireless playback pauses the local iOS bridge; bridge initialization failure restores native output and graph rebuilds reconnect the bridge.

## Progress

- [x] Implement reproduced security, streaming, queue, playlist, and service-worker repairs.
- [x] Add AirPlay control and iOS bridge regression coverage.
- [x] Run the complete 76-test playback/Cast/audit suite, TypeScript checking, and production compilation on the latest upstream `dev`.
- [x] Complete final compatibility review and follow-up regression tests.
- [x] Start the compiled application with isolated temporary data and verify its configuration endpoint returns HTTP 200.
- [ ] Verify AirPlay on physical iPhone/iPad/macOS Safari and receiver hardware.

## Validation

Run `npm ci --ignore-scripts`, `npm test`, `npx tsc --noEmit --project tsconfig.json`, and `npm run build --ignore-scripts`. The last command compiles production output without running the lifecycle hook that downloads platform binaries and rewrites the build hash. Normal release builds may continue using `npm run build`.

Tests exercise local HTTP streaming and proxy behavior, owner authorization, filesystem containment, session validity, legacy credential migration, queue cancellation, playlist integrity, browser routing, service-worker isolation, and escaped metadata. Potentially destructive probes use disposable fixtures or mocked filesystems. Deployment evidence and private configuration are maintained outside the repository.

The production-only dependency audit returned zero advisories during this repair. The development tree reported 19 advisories (10 high, 9 moderate); dependency remedies require separate compatibility evaluation and must not be applied through forced major downgrades.

Physical AirPlay delivery, device discovery on a real LAN, receiver codec compatibility, and iOS lock-screen behavior remain manual verification gates. Simulated browser tests establish application state transitions, not hardware success. Enabling local DSP may alter Safari's native routing behavior and also requires device testing.


## PR review corrections

Both review batches were checked against the PR head. Twelve distinct findings were corrected across receiver artwork/play intent, lyric speed, startup restore, media-query credentials, wireless settings, source-admin authentication, rename revocation order, shared-download cancellation/options, proxy timeout/error lifetime, playlist escaping and the portable directory-link fixture. Regression coverage includes real local HTTP media/proxy requests and simulated SDK/settings/rename boundaries. Windows execution and physical receiver playback were not repeated for this review pass.
