# Combined-code compatibility audit

Baseline: combined deployment code `0b752bb` (documentation head `995a9e0`). Scope: the customization/upstream merge, shared playback and recovery, Safari login/AirPlay, Cast, sync forms and custom VU rendering.

Nine behavioral defects were reproduced against the baseline and corrected. These are defects present in the combined tree; they were not all introduced by the merge itself.

| Conflict | Reproduction | Correction |
| --- | --- | --- |
| Crossfade UI versus pass-through audio | Enabling the live checkbox bypassed normalization applied only when settings loaded. | Normalize live updates too, keep crossfade off and explain the fixed policy in the UI. |
| Preload toggle versus foreground retry | Turning off “disable preload skip” changed the checkbox without changing the customized always-retry playback. | Reflect the existing retry behavior accurately in stored/live settings and the read-only control. |
| Cookie recovery versus API authentication | Automatic login redirected with a new cookie while retaining an expired API token. | Save the returned user/token before redirecting, sharing the manual-login persistence path. |
| Two sync-status elements | Duplicate IDs meant updates reached only the settings surface. | Use unique IDs and update both surfaces through one helper. |
| Modal versus settings connection fields | The modal's Connect button read the settings form's server/code instead. | Explicitly select the initiating form. Tests use fake connections only. |
| Seek versus pending Cast LOAD | A seek made while LOAD was pending reverted to the request's original position. | Retain and apply the latest seek after the matching LOAD completes. |
| Local recovery versus Cast handoff | A local stall timer could launch recovery after routing switched to Cast. | Validate the captured route before and after the connectivity probe; do not recover during pending Cast loading. |
| VU versus touch-device audio policy | The VU detector could capture native audio on a narrow touchscreen that the effects module deliberately bypassed. | Match the effects module's touchscreen detection. |
| Hidden detail VU versus render throttling | A detail-only standalone VU loop ran while its view was hidden. | Check detail visibility before starting and on each frame. |

## Verification

- Baseline replay: 20 focused tests, nine failures matching these cases and eleven existing Cast tests passing. Replay uses historical source without changing the current checkout.
- Corrected code: all 91 tests pass, including the existing metadata/artwork and security regressions. Type checking, production compilation and JavaScript/diff checks pass.
- Native AirPlay selection, custom VU styling, pass-through output, lyric-title/artist behavior and foreground preload retry remain intact. No backend changes are required by these corrections.
- Release validation: 41 isolated and 41 live runtime checks pass. Seven changed frontend files and 256 preserved files match their manifests; compiled backend and package metadata remain unchanged. All five sources initialize successfully. Six authenticated public HTTPS asset bodies match the release.
- Deployed code checkpoint: `6cafc09`, frontend worker `lx-music-web-v43`. Browser checks confirm the fixed settings states, unique/matching sync-status surfaces and centered controls; playback remains paused. Configuration bytes, six mounts and 51 unrelated containers are unchanged. Protected deployment evidence and rollback details are stored outside this public repository.
- Four portable corrections (pending Cast seeks, stale local recovery, sync-status surfaces and modal fields) also landed on the separate upstream PR branch, checkpoint `abd404a`; its 54 tests and type checks pass. Deployment-specific audio/login/VU policies remain in the combined profile.

Tests simulate the newly reproduced transitions. They do not establish every physical receiver/browser combination, audible output or iOS lock-screen behavior. Earlier hardware results are recorded separately.


## Reviewed fixes merged into the custom profile

The later combined release `fc98ffc` merges the reviewed PR corrections through `2e833cf` while retaining all nine earlier compatibility fixes and the custom login/VU/audio behavior. The full combined suite passes 116 tests, type checking and production compilation. The deployed image overlays only three compiled backend files and eight frontend files on the exact preceding audited image; 252 other backend/package/static files retain their hashes.

Isolated and live validation each pass 45 runtime checks, including cookie-only private media and scoped Cast access; all five sources initialize. Ten authenticated HTTPS asset bodies match. Browser checks confirm loaded artwork without reusable account query tokens, preserved fixed audio settings, centered desktop/320px transport without overlap and unchanged paused position. Configuration bytes, environment values, six mounts and 51 unrelated containers are preserved. Worker v45 refreshes the combined assets; the separate public PR profile uses v44. Protected backup and rollback evidence remain outside Git. Physical receiver playback was not repeated for this release.
