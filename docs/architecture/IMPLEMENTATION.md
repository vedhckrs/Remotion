# Architecture upgrade acceptance tracker

Source: SOURCE-PLAN.md, supplied on 2026-10-02. All 33 creative points remain mapped in CAPABILITIES.md. This is a staging upgrade; the current live panel is still the legacy release.

| Phase | Implementation and evidence | Remaining acceptance |
|---|---|---|
| Foundation | pnpm monorepo, pinned Node 24, strict TypeScript, Next.js; local verification and GitHub CI pass | Protected main release branch, Git deployment and hosted preview require the pending production configuration approval |
| Render backend | Neon projects/jobs/events/workers and outbox; authenticated render/control/asset APIs; four output profiles | Queue transport is implemented but not enabled or accepted against the live Vercel Queue service; durable DB claim fallback is tested |
| Worker | Outbound polling, exact Git checkout, frozen dependencies, fenced leases, single process/job, cancellation, progress and interruption failure | Install and verify the new production LaunchAgent after cutover approval; currently only staged local execution is accepted |
| Storage | Private direct multipart Blob uploads, checksum receipts, video/thumbnail/manifest, signed authenticated reads | Uploaded voice asset browser preview and authenticated signed read passed; hosted download checks await cutover |
| Mac tuning | Explicit threads/caches, conservative one-job defaults, complete 60-case 15-second 4K60 benchmark script | Full matrix currently running; selected measured profile and sustained acceptance await its results |
| Motion | Versioned tokens, 27 verbs, deterministic frame evaluation, paths, camera, transitions, selective blur | 17-family two-ratio gallery rendered; editorial review is still required for each real script and supplied assets |
| Information graphics | D3 seeded network, charts, hierarchy, timeline, geographic projection, funnel and comparisons | Maps currently project supplied points; detailed geographic boundaries must be supplied as assets/data |
| Illustration | Stable entity IDs, layered SVG/images/video, transform/morph/highlight/parallax; private assets | Real client artwork and editorial composition QA remain content-specific |
| 3D | Remotion + Three/R3F procedural icons, lighting, SVG extrusion, embedded GLB | Actual GLB/extrusion/portrait fixtures passed; model complexity is bounded and complex asset art direction remains content-specific |
| Audio | Word timing/captions, ducking, timed SFX; fixture checks audible audio and isolates frequency bands | Real voice recordings must be supplied for narrated final exports; automatic speech generation/alignment is not claimed |
| Director | Deterministic classification and entity/relation/beat/camera planner, validated JSON boundary | Heuristic fallback is functional; arbitrary script understanding by an external AI provider is not integrated |
| Reliability | Priority/scheduled claims, atomic multiworker fencing, verified scene cache, per-scene chunks, status/output analytics, safe fast-forward updater, content-addressed asset dedup | Priority/scheduling/expiry and analytics passed against real isolated Neon rows; new baseline gate awaits its fresh CI render; monetary cost requires an actual rate source |

## Completed render acceptance

- Legacy regression suite: 35 tests passed.
- Architecture schema/engine/security/cache checks pass; the real database test was run separately against isolated Neon rows and passed.
- Full browser-to-API-to-Mac-to-private-Blob staging job completed with its exact Git SHA; signed manifest read passed.
- Two-scene isolated release acceptance at revision `57559b057a088b6fd190f610854b36b767139a18` passed: initial render reused zero scenes, repeat reused both scenes. Joined video retained exact 30 fps; decoding, dimensions, duration, visual samples and private delivery passed.
- Audio, GLB loading, SVG extrusion, motion blur and portrait 3D fixtures passed. Music ducking and SFX cue windows were measured from the encoded fixture.
- Last verified GitHub CI: revision `57559b0`, run 37035463110. Subsequent changes must receive their own checks before release.

## Live cutover approval

Automatic approval review rejected changing the live Vercel build configuration and Git connection because that could replace or break the current working panel. The explicit production cutover question remains unanswered. No live configuration was changed by that rejected operation. After approval, set the Next.js project root/build, connect Git, establish the protected release branch, verify hosted preview, then switch the worker and accept an authenticated narrated final render on nuradi.co.in. Retain the legacy build configuration and service labels for rollback.

This tracker distinguishes implemented code, passing staging evidence, and live production acceptance. It does not mark pending steps complete.
