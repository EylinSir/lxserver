# Chromecast progress

- [x] Review existing playback, authentication and Google Web Sender integration.
- [x] Implement mobile-accessible Cast controls, remote transport and local handoff.
- [x] Implement expiring resource capabilities without sharing general login credentials.
- [x] Preserve native Safari/AirPlay and existing player behavior.
- [x] Keep transport centered with equal side columns; group speed and wireless controls on the right.
- [x] Integrate on the latest upstream `dev`, retaining its HTTP cookie, metadata, playback recovery and synchronization fixes.
- [x] Prevent local crossfade from modifying Cast volume, including fades already running during handoff.
- [x] Pass 50 automated checks, TypeScript checking and production compilation.
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
- [ ] Validate and deploy the corrected frontend while preserving the combined backend and custom assets.

See [the compatibility audit](../combined-conflict-audit.md) for reproductions, fixes and validation limits. Frontend worker v43 refreshes the corrected assets.
