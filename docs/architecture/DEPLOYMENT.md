# Proposed production cutover

This is a reviewable plan. The live project remains on its current build configuration until approval. Proposed Next.js configuration is committed in apps/web/vercel.json. Do not deploy the monorepo using the legacy root vercel.json.

1. Confirm the exact feature revision has passing CI, local database acceptance, encoded/QC checks, private delivery and dashboard preview checks.
2. Establish a main release branch containing the accepted existing production fixes and architecture. Require Architecture CI / validate for merges and prohibit force pushes. Keep feature work on feature branches.
3. Connect vedhckrs/Remotion to the existing nuradi-render-control Vercel project. Set rootDirectory to apps/web, framework to nextjs, Node to 24.x, clear the legacy output-directory override, and use the committed apps/web/vercel.json. Preserve the current Vercel project settings before mutation.
4. Preserve private authentication settings. Retain Neon and private Blob integration variables. Configure NURADI_BLOB_HOST for the existing private store. Let VERCEL_GIT_COMMIT_SHA supply the immutable release revision. Remove a stale NURADI_RELEASE_SHA override if it would select a different commit.
5. Deploy and accept a hosted preview before promoting it to the existing apex nuradi.co.in. Check unauthenticated denial, login/CSRF, private uploads and Player preview, render queue and signed artifact delivery. Keep the www redirect to apex.
6. Change the private worker environment to the live HTTPS origin and trusted origin/main release ref. Disable local test mode. Stop the legacy polling worker, then install the new Node 24 outbound-only LaunchAgent with the checked script. Verify heartbeat and that one job runs at a time. No inbound Mac port or tunnel is needed.
7. Queue a narrated final 4K60 render with real voice assets from the live panel. Verify exact revision, audio, dimensions, 60 fps, full decoding, scene appearance, manifest and authenticated download. Exercise cancellation and offline/resume behavior.
8. Vercel Queue dispatch remains optional until authenticated hosted queue acceptance passes. The tested durable Neon claim/outbox path remains available when Queue dispatch is unavailable.

## Rollback

Pause the new worker before restoring the previous Vercel deployment/build configuration. Restore the legacy worker environment and service, then verify the prior live health and authenticated rendering. Keep Neon job/artifact records; do not delete pending work to perform rollback. Legacy config is preserved at docs/architecture/legacy-vercel.json. New and old worker services must never compete for the same acceptance test.

## Remaining limitations

- The director is a deterministic local fallback; a general-purpose external AI planner is not integrated.
- Visual regression covers the two PROCESS ratio fixtures. Blank/stuck-frame sampling is technical QC; editorial object/text/camera QA remains necessary.
- A complete 15-second benchmark matrix does not prove an uninterrupted hour-long project. Memory and thermal throughput acceptance must describe the actual test duration.
- Render throughput uses measured RENDERING-to-UPLOADING event time. Optional render cost estimates require explicit NURADI_RENDER_HOURLY_COST and a three-letter NURADI_RENDER_COST_CURRENCY; no rates are invented. These estimates exclude storage/transfer/provider costs and waiting time.
- The referenced Endor dependency-risk tooling is unavailable. No Endor verdict has been represented as passing.
