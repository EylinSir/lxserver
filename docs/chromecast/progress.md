# Chromecast progress

- [x] Review existing playback, authentication and Google Web Sender integration.
- [x] Implement mobile-accessible Cast controls, remote transport and local handoff.
- [x] Implement expiring resource capabilities without sharing general login credentials.
- [x] Preserve native Safari/AirPlay and existing player behavior.
- [x] Keep transport centered with equal side columns; group speed and wireless controls on the right.
- [x] Integrate on the latest upstream `dev`, retaining its HTTP cookie, metadata, playback recovery and synchronization fixes.
- [x] Prevent local crossfade from modifying Cast volume, including fades already running during handoff.
- [x] Pass 74 automated checks, TypeScript checking and production compilation.
- [x] Start the compiled server with isolated temporary data; verify HTTP cookie login, authenticated player markup, Cast assets and worker version.

An earlier compatible deployment passed 35 isolated/live runtime checks, 30 existing metadata/artwork checks and release asset verification. Desktop Chrome and an Onkyo TX-RZ50 accepted MP3 and reported advancing playback, pause, seek and disconnect; local audio stayed paused while casting. Responsive controls were checked at desktop and 320px widths with zero center offset and no control overlap. These hardware/layout checks describe that deployed version; the latest upstream integration has automated and isolated-startup coverage, not another physical receiver run.

Live validation also reproduced and fixed playlist-category escaping-helper shadowing and a batch-module export referring to a function defined by a later script. Regression tests cover both startup/rendering failures.

Physical Android, other receiver/codec combinations, independent audible monitoring and iOS lock-screen/DSP transitions remain separate manual checks.

- [x] Follow-up compatibility audit: retain seeks during pending Cast LOAD, reject stale local-recovery timers after route changes, and synchronize unique sync-status views with the correct initiating connection form. Four focused regressions cover these shared fixes.


## PR review follow-up

- [x] Verify both automated review batches against the current source; address all twelve distinct findings.
- [x] Preserve standard/scoped artwork, pending play intent, lyric speed and resumed Cast sessions.
- [x] Save local EQ/preset/reverb/pitch/panner settings during wireless playback without capturing native audio.
- [x] Remove generated reusable account tokens from native media/artwork/download URLs; validate read-only account-cookie access and rejection of guest/expired/deleted sessions.
- [x] Reject empty administrator secrets, revoke credentials before user-space rename/migration, escape playlist statistics/errors, and use a Windows-compatible directory-link fixture.
- [x] Isolate shared-download cancellation and retry unaffected callers; serialize differing lyric/provenance requirements and use separate temporary paths for retries.
- [x] Limit proxy timeout to response headers and terminate downstream output on request/response failure or upstream abort.
- [x] Pass all 74 tests, type checking and production compilation; refresh first-party assets with worker v44.
- [x] Start the corrected compiled application with disposable data: ten isolated checks pass for login/cookie flags, authenticated player/worker and cookie-only private media authorization. Historical source replay reproduces twenty failures across 59 focused tests; the corrected suite passes.
