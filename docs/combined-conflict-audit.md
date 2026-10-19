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
- Release validation: pending isolated/live API, served-asset, configuration-preservation and browser checks.

Tests simulate the newly reproduced transitions. They do not establish every physical receiver/browser combination, audible output or iOS lock-screen behavior. Earlier hardware results are recorded separately.
