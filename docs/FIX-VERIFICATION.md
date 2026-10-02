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

- 34 native regression tests pass; reference TypeScript checks pass.
- Chrome metadata check confirms final SocialVideo exports reject missing narration and explicit silent drafts resolve.
- Actual landscape and portrait render smoke runs: 32 scene stills (16 per ratio, all 14 diagram kinds), plus two 120-frame H.264 clips.
- Visual review of both contact sheets, including layer-label positions.
- Encoded-file QC fixture verifies wrong dimensions, missing audio and failed loudness are blocking checks.
- npm audit returned zero known vulnerabilities for the pinned dependency graph.
- JavaScript module syntax, shell parsing and git whitespace checks.
- Remote authentication, allowlisted commands, duplicate UUIDs, result delivery and single-worker lease tested with a simulated Redis transport.

## Verification boundaries

Paid TTS/music APIs, live YouTube/Meta uploads, OAuth sign-in, launchd installation and a complete final voiced 4K package have not been exercised. Several script contracts have static regression checks; those are not live platform tests. Existing customized user projects have not been overwritten. Final artifact metadata/QC for arbitrary external --file uploads still requires manual review.

The Endor dependency review could not run because its CLI/MCP evidence source is unavailable. Its package risk remains unassessed; npm audit is a separate known-vulnerability check, not an Endor approval.

Vercel account/project access is verified. Hosted Redis provisioning, live authenticated Mac connection and custom-domain cutover remain deployment steps; do not call them complete solely because the web build passes.

## Hosting snapshot

Separate Vercel project: nuradi-render-control. Deployed control panel: https://nuradi-render-control.vercel.app. The deployed API was checked to reject unauthenticated requests. A dedicated free Upstash Redis resource named nuradi-render-queue was provisioned and connected; autoUpgrade=false and prodPack=false were requested. The existing www.nuradi.co.in mapping is unchanged. Authentication secrets and Mac worker connection await explicit credential authorization and selection of the local project.
