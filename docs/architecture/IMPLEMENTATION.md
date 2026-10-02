# Architecture upgrade acceptance tracker

Source: SOURCE-PLAN.md, supplied by the user on 2026-10-02. Linked sandbox documents and original source IDs are not available. Current external APIs are verified separately.

| Phase | Acceptance | Status |
|---|---|---|
| Foundation | pnpm monorepo, Node 24, strict TS, Next.js, CI, protected release branch, previews | In progress |
| Render backend | Neon projects/jobs/events/workers, authenticated APIs, profiles, durable offline queue | Pending |
| Worker | outbound pickup, isolated Git SHA, locked dependencies, bundle cache, lease fencing, progress/cancel/recovery | Pending |
| Storage | private multipart Blob, QC/checksum, preview/download/manifest | Pending |
| M5 tuning | one job, explicit caches/threads, benchmark/profile tooling | Pending |
| Motion | tokens/grid/type, verbs, paths/morph/masks, camera/transitions | Pending |
| Information graphics | D3 charts, diagrams, hierarchy/timeline/map/funnel/comparison | Pending |
| Illustration | object IDs, SVG layering, parallax/morph/highlights | Pending |
| 3D | Remotion/Three/R3F, procedural icons, SVG extrusion, GLB, lighting/camera | Pending |
| Audio | words/captions, ducking, semantic SFX | Pending |
| Director | semantics/classification/entities/relations/transformations to validated JSON | Pending |
| Reliability | scheduling/priority, multiple worker fencing, scene cache/analytics/visual regressions/chunks/update management/dedup | Pending |

The 33 source capabilities are tracked individually in CAPABILITIES.md. A feature is complete only after its acceptance check passes. Existing live control remains available until the new deployment has passed its checks.
