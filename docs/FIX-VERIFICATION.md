# Audit fixes and verification

Baseline: b098f34bfde0fc748937278f86af8752c419cc6e. Branch: fix/production-audit.

| Finding | Implemented correction |
|---|---|
| F01 | Voice chunks use immutable content-hash filenames and complete scene mappings. |
| F02 | Publishing resolves only the requested video's own artifact; global newest-output fallback removed. |
| F03 | Dry-run returns a plan before API calls, logs, status changes or queue writes. |
| F04 | Every requested scene needs current text, timing and audio; package render gates incomplete voices and SocialVideo finals reject missing narration. Explicit silent layout drafts remain available. |
| F05 | Blocking QC persists its report and fails the render process/job. |
| F06 | Provider overrides reset incompatible voice, model and provider settings. |
| F07 | Durable session offsets and remote video IDs, platform receipts and upload locks protect retries; ambiguous Meta responses block resubmission. |
| F08 | Music callers use explicit output paths; disabling music clears the old source. |
| F09 | Package sync compares bytes and removes previously owned deleted files. |
| F10 | Input freshness includes voice/media/font bytes, renderer code/version and saved settings. |
| F11 | Captions, chapters and scene starts use one canonical frame timeline, ID lookup and minimum durations. |
| F12 | Defensive validation rejects unsafe IDs, empty/malformed scenes, invalid nested arrays and non-finite numbers. |
| F13 | Exclusive queue locks, reload after lock, producing recovery, atomic writes and persistent dashboard history. Restarted active jobs require deliberate retry. |
| F14 | Show/hide/focus/set evaluate beats in chronological order, including seeking. |
| F15 | Zero chart denominators are guarded; unsupported negative or out-of-range chart data is rejected. |
| F16 | Portrait ring labels fit the diagram area across supported counts. |
| F17 | Template ownership hashes and pre-write conflict checks preserve customized files; backups precede overwrites. |
| F18 | Dashboard subprocess spawn failures are handled as failed jobs. |
| F19 | Correct single/suffix byte ranges and 416 responses for unsatisfiable ranges. |
| F20 | OAuth state, PKCE, loopback callback, timeout, explicit token display and mode-600 token persistence. |
| F21 | Effective hardware fallback flag always exported; 4K hardware bitrates corrected. |
| F22 | Per-project launchd labels; escaped XML and direct argument arrays. |
| F23 | A package selected as the library root has the explicit accessible @root ID. |

Additional fixes: font-dependent layout waits for bundled fonts; Instagram processing timeout blocks publication; scaffold icon installation uses the selected package manager's add command. Dependency lockfile, native regression checks, reference TypeScript project and CI added.

## Verified locally

- 35 native regression tests pass; reference TypeScript checks pass.
- Chrome metadata check confirms final SocialVideo exports reject missing narration and explicit silent drafts resolve.
- Actual landscape and portrait render smoke runs: 32 scene stills (16 per ratio, all 14 diagram kinds), plus two 120-frame H.264 clips.
- Visual review of both contact sheets, including layer-label positions.
- Encoded-file QC fixture verifies wrong dimensions, missing audio and failed loudness are blocking checks.
- npm audit returned zero known vulnerabilities for the pinned dependency graph.
- JavaScript module syntax, shell parsing and git whitespace checks.
- Remote authentication, allowlisted commands, duplicate UUIDs, result delivery and single-worker lease tested with a simulated Redis transport.

## Verification boundaries

Paid TTS/music APIs, live YouTube/Meta uploads and OAuth sign-in have not been exercised. Several script contracts have static regression checks; those are not live platform tests. Existing customized user projects have not been overwritten. Final artifact metadata/QC for arbitrary external --file uploads still requires manual review.

The Endor dependency review could not run because its CLI/MCP evidence source is unavailable. Its package risk remains unassessed; npm audit is a separate known-vulnerability check, not an Endor approval.

Vercel, hosted Redis, domain TLS, authentication and the live Mac connection were verified against production.

## Hosting snapshot

Separate Vercel project: nuradi-render-control. Deployed control panel: https://nuradi-render-control.vercel.app. The deployed API was checked to reject unauthenticated requests. A dedicated free Upstash Redis resource named nuradi-render-queue was provisioned and connected; autoUpgrade=false and prodPack=false were requested. The existing www.nuradi.co.in mapping redirects to https://nuradi.co.in. Authentication credentials were configured after explicit user approval. Live sign-in returned HTTP 200; the hosted connection check showed the Mac online; authenticated state/packages commands returned the persistent local-studio project and its package list. The apex domain https://nuradi.co.in serves this project over HTTPS.


## Live production verification - 2026-10-02

- A persistent local project lives in Remotion/local-studio, with a dedicated local library. Dashboard and cloud worker are installed as per-project macOS login services. The worker inhibits idle sleep while it runs; rendering requires the Mac to remain powered and connected.
- Real narrated 4K60 exports passed all encoded QC checks: landscape 3840x2160 and portrait 2160x3840, H.264/BT.709, stereo AAC 48 kHz, 3.117 seconds, measured -14 LUFS and -4.02 dBTP. This is a one-scene infrastructure check, not a full editorial episode.
- Mac speech output is parsed as WAV and rejects empty or silent successful subprocess output. A new regression test covers this failure.
- Render, storyboard and thumbnail browser startup use installed macOS Chrome or an explicit REMOTION_BROWSER_EXECUTABLE, avoiding stalled browser downloads. Dashboard composition and direct-render startup use the same installed-browser fallback.
- Local library content and worker journals/logs are excluded from Vercel uploads.
- Domain sign-in, live library retrieval, cloud render completion including thumbnails, and cloud cancellation were exercised using the configured private credentials.
