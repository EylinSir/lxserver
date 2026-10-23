# Chromecast playback

Use the player in a Cast-enabled desktop or Android Chrome browser over HTTPS. A Cast button appears when the Google sender SDK is ready; opening its picker starts receiver discovery. Safari and iOS keep their existing playback and AirPlay behavior; Google's Web Sender does not support iOS Chrome.

Select a receiver to transfer the current track and position. The normal player controls must operate remote play/pause, seeking, volume, mute, previous/next and automatic queue advancement. Disconnect returns the current position and playback intent to the local player. Connecting must preserve the receiver's existing volume.

Support online music, server cache/downloads and configured custom music directories. Browser-only blob/file URLs cannot be fetched by a receiver and must produce a useful error. Receiver codec support varies; users can select another quality/source if necessary. Casting uses normal speed; local playback speed is restored on disconnect. The receiver fetches the original audio, so browser audio effects and visualizers do not process its output.

Never send account tokens, cookies or administrator credentials to a receiver. Its media capability must permit only one immutable read resource, expire, and stop working after the issuing credentials are revoked. Existing ownership, filesystem and public-upstream restrictions remain mandatory.

Acceptance: automated local/remote handoff and race tests, actual HTTP range/HEAD/CORS and authorization tests, existing AirPlay regressions, type checking, production compilation, isolated release startup and deployed API/asset verification. Report real receiver playback separately from simulations and network advertisements.

Player and About must identify the running package version plus a reproducible source build fingerprint. Custom builds sharing an upstream release number must remain distinguishable. Missing generated config must not fabricate an older release; package metadata remains authoritative when available, otherwise show an unavailable state.
