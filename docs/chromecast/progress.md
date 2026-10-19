# Chromecast progress

- [x] Review existing playback, authentication and Google Web Sender integration.
- [x] Implement mobile-accessible Cast controls, remote transport and local handoff.
- [x] Implement expiring resource capabilities without sharing general login credentials.
- [x] Preserve native Safari/AirPlay and existing player behavior.
- [x] Keep transport centered with equal side columns; group speed and wireless controls on the right.
- [x] Integrate on the latest upstream `dev`, retaining its HTTP cookie, metadata, playback recovery and synchronization fixes.
- [x] Prevent local crossfade from modifying Cast volume, including fades already running during handoff.
- [x] Pass 76 automated checks, TypeScript checking and production compilation.
- [x] Start the compiled server with isolated temporary data; verify HTTP cookie login, authenticated player markup, Cast assets and worker version.

An earlier compatible deployment passed 35 isolated/live runtime checks, 30 existing metadata/artwork checks and release asset verification. Desktop Chrome and an Onkyo TX-RZ50 accepted MP3 and reported advancing playback, pause, seek and disconnect; local audio stayed paused while casting. Responsive controls were checked at desktop and 320px widths with zero center offset and no control overlap. These hardware/layout checks describe that deployed version; the latest upstream integration has automated and isolated-startup coverage, not another physical receiver run.

Live validation also reproduced and fixed playlist-category escaping-helper shadowing and a batch-module export referring to a function defined by a later script. Regression tests cover both startup/rendering failures.

Physical Android, other receiver/codec combinations, independent audible monitoring and iOS lock-screen/DSP transitions remain separate manual checks.

## Combined deployment profile

- [x] Merge the upstream integration with the existing customization branch, preserving the custom stereo VU themes, search response compatibility, quality badges, pass-through volume policy and transient preload retry behavior.
- [x] Retain lyric-title, composite artist and raster artwork behavior; include the 30 existing metadata regressions in the combined suite.
- [x] Pass all 82 tests, including saved pass-through settings and transient preload retry regressions; refresh the combined frontend worker to v42.
- [x] Validate and deploy the combined release: 38 isolated and 38 live runtime checks; 179 release file hashes and 84 retained static asset hashes match; five sources initialize successfully.
- [x] Verify signed-in HTTPS assets, secure cookies and centered desktop/320px controls; configuration bytes, six mounts and 51 unrelated containers remain unchanged.

The existing customization history includes eleven commits from October 12–13, before the October 19 audit, covering VU themes, audio behavior, search compatibility and badges. These are retained from the user's fork. Commit author identities alone do not distinguish manual work from assistant-generated work.

## Combined-code compatibility audit

- [x] Reproduce and fix nine behavioral conflicts across fixed audio policies, automatic login, sync surfaces, Cast/recovery handoff and custom VU rendering.
- [x] Pass all 91 tests, type checking and production compilation; retain the existing lyric/artwork, security and playback regressions.
- [x] Deploy code `6cafc09`: 41 isolated and 41 live runtime checks pass, seven changed and 256 preserved file hashes match, all five sources initialize, and signed-in HTTPS/browser checks pass. Configuration, six mounts and 51 unrelated containers remain unchanged.
- [x] Port the four shared Cast/recovery/sync corrections to upstream PR #451 (`abd404a`), with all 54 tests and type checks passing.

See [the compatibility audit](../combined-conflict-audit.md) for reproductions, fixes and validation limits. Frontend worker v43 refreshes the corrected assets.

- [x] Follow-up compatibility audit: retain seeks during pending Cast LOAD, reject stale local-recovery timers after route changes, and synchronize unique sync-status views with the correct initiating connection form. Four focused regressions cover these shared fixes.


## PR review follow-up

- [x] Verify both automated review batches against the current source; address all twelve distinct findings.
- [x] Preserve standard/scoped artwork, pending play intent, lyric speed and resumed Cast sessions.
- [x] Save local EQ/preset/reverb/pitch/panner settings during wireless playback without capturing native audio.
- [x] Remove generated reusable account tokens from native media/artwork/download URLs; validate read-only account-cookie access and rejection of guest/expired/deleted sessions.
- [x] Reject empty administrator secrets, revoke credentials before user-space rename/migration, escape playlist statistics/errors, and use a Windows-compatible directory-link fixture.
- [x] Isolate shared-download cancellation and retry unaffected callers; serialize differing lyric/provenance requirements and use separate temporary paths for retries.
- [x] Limit proxy timeout to response headers and terminate downstream output on request/response failure or upstream abort.
- [x] Pass all 76 tests, type checking and production compilation; refresh first-party assets with worker v44.
- [x] Start the corrected compiled application with disposable data: ten isolated checks pass for login/cookie flags, authenticated player/worker and cookie-only private media authorization. Historical source replay reproduces twenty failures across 59 focused tests; the corrected suite passes.


## Reviewed fixes in the customized deployment

- [x] Merge PR review corrections through `2e833cf` with the custom audio/login/VU profile, retaining the previous nine compatibility corrections.
- [x] Pass all 116 combined tests (104 CJS + 12 TypeScript), type checking and production compilation.
- [x] Validate the isolated image: 45 runtime checks, all five sources initialized, 11 updated and 252 retained file hashes match.
- [x] Back up and deploy code `fc98ffc`: 45 live checks and ten authenticated HTTPS asset hashes pass. Configuration bytes, environment values, six mounts and 51 unrelated containers are preserved. Desktop/320px controls are centered without overlap, artwork loads without account query tokens, and playback remains paused at its prior position.

The combined release uses worker v45. The public PR remains a separate profile and is not merged into the official repository by this deployment.
