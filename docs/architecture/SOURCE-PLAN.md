# Remotion Production System for MacBook Air M5: Deep Research and Full Architecture Plan

## Final architecture decision

The architecture you described is not only workable; it is the architecture I recommend for your specific goal of continuously developing a Remotion-based animation platform while keeping **heavy 4K 60 FPS rendering on your own MacBook Air M5**.

The production system should be split into two clearly separated layers:

```text
CONTROL PLANE
────────────────────────────────────────────────────────────

Local Development
      ↓
GitHub
      ↓
GitHub Actions / CI
      ↓
Vercel Preview
      ↓
Protected main
      ↓
Vercel Production
      ↓
Live Custom Domain
      ↓
Dashboard + API + Job Management


RENDER PLANE
────────────────────────────────────────────────────────────

Live Dashboard
      ↓
Create Render Job
      ↓
Database + Dispatch Queue
      ↓
Local MacBook Render Worker
      ↓
Exact Git Commit
      ↓
Remotion
      ↓
4K / 60 FPS Render
      ↓
Output QC
      ↓
Vercel Blob
      ↓
Dashboard Preview / Download
```

This keeps Vercel responsible for the web application and control layer rather than trying to turn Vercel Functions into a long-running video-rendering machine. Vercel Functions have bounded execution duration and memory; even with current Fluid Compute, they are not the right execution environment for the kind of sustained local Chromium/Remotion workload involved in your heavy 4K60 videos. citeturn16search6turn16search7

Vercel's Git integration already supports exactly the deployment side of your requested workflow: branch pushes can create previews, and changes merged or pushed into the production branch create production deployments. Vercel's GitHub integration also updates the configured custom production domain with the production deployment. citeturn16search3turn16search4

Your final topology should therefore be:

```text
DEVELOPMENT

MacBook
   │
   ├── edit
   ├── test
   ├── typecheck
   ├── build
   └── smoke render
   │
   ▼
GitHub
   │
   ├── Actions
   ├── protected main
   └── release Git SHA
   │
   ▼
Vercel
   │
   ├── Next.js dashboard
   ├── API
   ├── DB integration
   ├── queue/job dispatch
   ├── Blob storage
   └── custom domain


RENDERING

Dashboard
   ↓
Render Job
   ↓
Vercel control plane
   ↓
outbound job pickup
   ↓
MacBook Air M5
   ↓
Remotion worker
   ↓
SVG / D3 / Three.js
   ↓
Remotion renderer
   ↓
H.264 / H.265 / ProRes
   ↓
Vercel Blob
   ↓
Dashboard
```

The complete researched Markdown implementation document is here:

**[Download the full `.md` architecture and implementation plan](sandbox:/mnt/data/remotion_m5_vercel_local_render_deep_research_plan.md)**

The file contains the repository architecture, APIs, worker lifecycle, job database, Queue design, Git-SHA isolation, 4K60 Mac tuning, Remotion architecture, all previous thirty-three animation points, security model, QC, implementation roadmap and primary research sources.

## Development, GitHub and Vercel production pipeline

### Use one monorepo

I recommend keeping your live dashboard, Remotion code, shared scene schemas and local render worker in **one Git repository**.

```text
remotion-production/
│
├── apps/
│   ├── web/                  # Next.js → Vercel
│   └── worker/               # Node.js → MacBook only
│
├── packages/
│   ├── video/                # Remotion project
│   ├── schemas/              # Zod + TypeScript contracts
│   ├── design-tokens/
│   ├── database/
│   └── shared/
│
├── scripts/
│   ├── benchmark-render.ts
│   ├── smoke-render.ts
│   ├── verify-output.ts
│   └── cleanup-releases.ts
│
├── .github/workflows/
│   └── ci.yml
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── tsconfig.base.json
```

This matters because your dashboard and renderer need to agree on exactly the same `SceneSpec`, `RenderSettings`, composition IDs, style tokens and schema versions. Remotion itself supports parameterized compositions through serializable input props, making shared typed contracts a natural design for this architecture. citeturn19search25turn15search1

### Pin Node.js 24 everywhere

There is a particularly important October 2026 detail here.

Vercel deprecated Node.js 20 for new Builds and Functions on **October 1, 2026**. It explicitly recommends moving projects to Node.js 24, including setting:

```json
{
  "engines": {
    "node": "24.x"
  }
}
```

Because today is October 2, 2026, I would not begin the new architecture on Node 20. citeturn16search9

Use the same major runtime everywhere:

```text
Mac local development      Node 24
Mac rendering worker       Node 24
GitHub Actions             Node 24
Vercel Builds              Node 24
Vercel Functions           Node 24
```

Also add:

```text
.node-version
```

with:

```text
24
```

That eliminates one category of “works locally but not in production” problems.

### Your daily development workflow

Your working path becomes:

```text
feature branch
      ↓
develop locally
      ↓
local preview
      ↓
lint
      ↓
TypeScript check
      ↓
tests
      ↓
production build
      ↓
small Remotion smoke render
      ↓
commit
      ↓
GitHub
```

For example:

```bash
git switch -c feat/network-diagram-engine

pnpm install --frozen-lockfile

pnpm dev

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm render:smoke

git add -A
git commit -m "feat: add semantic network diagram engine"
git push -u origin feat/network-diagram-engine
```

GitHub's official Actions guidance supports using the same build/test commands in CI that you use locally, and its current documentation examples use the current `actions/checkout` and `actions/setup-node` generations. citeturn16search1

### Do not directly treat every `main` push as unvalidated code

Your original requirement says:

> Local → push main → GitHub → Vercel.

Technically that works, but I recommend a slightly stronger version:

```text
Local feature branch
       ↓
GitHub
       ↓
CI
       ↓
Vercel Preview
       ↓
Review
       ↓
Merge protected main
       ↓
Vercel Production
       ↓
Live domain
```

GitHub protected branches can require status checks before a change reaches `main`, prevent force pushes/deletion, and optionally require a pull request. citeturn16search0turn16search2

For your project I would require:

```text
✓ lint
✓ typecheck
✓ unit tests
✓ production web build
✓ Remotion smoke render
```

A practical CI configuration is:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  validate:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - run: corepack enable
      - run: pnpm install --frozen-lockfile

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm render:smoke
```

The smoke render should be a tiny deterministic project—perhaps 640×360 or 1280×720 for several seconds—not your expensive 4K60 production output.

### Vercel then handles deployment automatically

Configure:

```text
Git provider            GitHub
Production branch       main
Framework               Next.js
Node                    24.x
Preview deployments     enabled
Custom domain           enabled
System env variables    enabled
Deployment Checks       recommended
```

Vercel automatically supports preview deployments for branch/PR changes and production deployments from the configured production branch. citeturn16search3turn21search17

Vercel Deployment Checks can further separate “the build succeeded” from “this is now promoted to the production domain”; a deployment can be built while promotion waits for selected checks. citeturn16search5turn21search22

So your release chain becomes:

```text
LOCAL MACBOOK
    ↓
feature branch
    ↓
GITHUB
    ↓
GitHub Actions
    ↓
VERCEL PREVIEW
    ↓
merge to protected main
    ↓
VERCEL PRODUCTION BUILD
    ↓
Deployment Checks
    ↓
CUSTOM DOMAIN
```

### Every render must contain its exact Git SHA

This is one of the most important improvements to your original architecture.

Vercel exposes the Git SHA associated with a deployment through `VERCEL_GIT_COMMIT_SHA` when system environment variables are exposed. citeturn21search1

When someone creates a video from production, create:

```json
{
  "renderId": "3d2d...",
  "compositionId": "MainExplainer",
  "gitSha": "fa1eade47b73733d6312d5abfad33ce9e4068081",
  "schemaVersion": 3,
  "inputProps": {},
  "renderSettings": {
    "profile": "final-4k60"
  }
}
```

Never simply tell your Mac:

```text
render latest local code
```

because your local development tree could already be ahead of production.

Instead:

```text
Vercel deployment SHA
        ↓
render job
        ↓
Mac worker
        ↓
exact same Git SHA
        ↓
render
```

That gives you reproducible client deliverables.

## Vercel-to-MacBook rendering architecture

### Do not expose your MacBook to the public internet

I strongly recommend against:

```text
Vercel
   ↓
public home IP
   ↓
Mac :3000
```

and against making a permanent public `ngrok`-style tunnel a fundamental dependency.

The safer architecture is reversed:

```text
Vercel
     ▲
     │ HTTPS outbound
     │
Mac worker
```

Your Mac **pulls** jobs.

That means:

```text
NO router port forwarding
NO public Mac HTTP server
NO static public home IP required
NO incoming firewall exception required
```

The Mac only makes outbound connections to:

```text
Vercel
GitHub
Blob storage
Job database/queue
```

### Job database

You need a durable source of truth that survives:

```text
Mac reboot
network loss
Vercel deployment
browser closing
worker crash
render retry
```

Vercel's current storage architecture supports Postgres integrations from providers such as Neon through the Marketplace; Vercel's former native Postgres product was migrated to Neon and new projects use Marketplace integrations. citeturn21search0turn21search5

I would use:

```text
Neon Postgres
```

with at minimum:

```text
render_jobs
render_events
render_workers
projects
```

A job state machine should look like:

```text
QUEUED
   ↓
CLAIMED
   ↓
PREPARING
   ↓
RENDERING
   ↓
UPLOADING
   ↓
COMPLETED
```

Side paths:

```text
RENDERING
   ↓
CANCEL_REQUESTED
   ↓
CANCELLED
```

and:

```text
ANY EXECUTION STATE
   ↓
FAILED
```

### Use Vercel Queues as dispatch, not as the sole job database

Vercel Queues entered public beta on February 27, 2026. Its **poll mode is specifically designed for consumers running outside Vercel**, including long-running services and on-premises workers. That is almost exactly the topology of your MacBook render worker. citeturn22search0turn15search3

Architecture:

```text
Dashboard
   ↓
POST /api/renders
   ↓
write render_jobs record
   ↓
publish {renderId}
   ↓
Vercel Queue
   ↓
Mac polls queue
   ↓
claim job
```

But I would not let Queue ownership remain open for the entire heavy 4K render.

Queues use lease/visibility semantics, and their API currently limits individual visibility extensions to a maximum of 60 minutes. citeturn22search1

Therefore:

```text
Queue message
   ↓
Mac receives renderId
   ↓
Mac atomically marks DB job CLAIMED
   ↓
Queue message acknowledged
   ↓
actual render lifecycle tracked in DB
```

That is much more reliable for videos that may take considerably longer than an hour.

### One current Queue issue you should know about

For poll mode, Queue authentication uses Vercel OIDC. Local development OIDC tokens obtained through `vercel env pull` currently expire after **12 hours**. citeturn22search2turn22search6

Therefore I would design transport behind an interface:

```ts
interface JobTransport {
  nextJob(): Promise<RenderJobReference | null>;
  health(): Promise<boolean>;
}
```

Then use:

```text
Primary:
Vercel Queue poll mode

Safety:
periodic API/DB reconciliation

Fallback:
authenticated job-claim API
```

If Queue authentication temporarily fails, the render is not lost because the actual job remains:

```text
status = queued
```

in Postgres.

### Render-job API

Your web application needs only short APIs.

```text
POST /api/renders
GET  /api/renders/:id
POST /api/renders/:id/cancel

POST /api/worker/heartbeat
POST /api/worker/renders/:id/claim
POST /api/worker/renders/:id/progress
POST /api/worker/renders/:id/complete
POST /api/worker/renders/:id/fail
```

Creation should be:

```text
User presses Render
      ↓
authenticate
      ↓
validate SceneSpec
      ↓
validate Composition
      ↓
validate render profile
      ↓
attach production Git SHA
      ↓
insert DB job
      ↓
send queue event
      ↓
return HTTP 202
```

The API finishes immediately.

It does **not** do this:

```text
POST /render
     ↓
keep Vercel Function alive for 2 hours
     ↓
render 4K60
```

Vercel Function runtime limits are another reason to keep long heavy video computation out of this control plane. citeturn16search6

### Dashboard progress

Remotion's `renderMedia()` renderer supports an overall progress value through its progress callback. citeturn20search1turn19search7

Therefore:

```text
Remotion renderMedia()
        ↓
onProgress
        ↓
local throttler
        ↓
PATCH progress endpoint
        ↓
Postgres
        ↓
Dashboard
```

Do not call your API once per frame.

For a 10-minute 60 FPS project that would mean:

```text
36,000 frames
```

and potentially thousands of unnecessary status requests.

Throttle to approximately:

```text
1 update / second

or

update when ≥1% changes

or

immediate update when stage changes
```

Dashboard:

```text
MacBook Air M5           ● ONLINE

Project                  AI Infrastructure Explainer
Render                   #r_20261002_0021
Revision                 a813f7…
Output                    3840 × 2160
Frame rate                60 FPS
Codec                     H.264
Status                    Rendering

████████████████░░░░░░░   68.4%

Frame                     24,624 / 36,000
Elapsed                   00:42:09
ETA                       approximate
```

I would initially have the dashboard poll status every second rather than making your architecture dependent on current Vercel WebSocket public-beta infrastructure. Vercel added WebSocket support in public beta in June 2026, so you can add it later purely as a UX enhancement while keeping database state authoritative. citeturn22search23

### Output must go Mac → Blob directly

Do not do:

```text
Mac
 ↓
2 GB MP4
 ↓
Vercel Function
 ↓
Blob
```

Vercel documents a 4.5 MB Function request-body limit for server uploads through Functions. Its Blob product supports large-file multipart upload, including retries and progress, and recommends multipart upload for large files. citeturn15search6turn15search7turn15search8

Use:

```text
Mac local render
      ↓
output QC
      ↓
@vercel/blob
      ↓
multipart upload directly
      ↓
Blob
      ↓
URL/path
      ↓
job database
```

For private client deliverables, use private storage rather than a world-readable public Blob URL. Vercel Blob supports both access models. citeturn15search8

### Exact release checkout on the Mac

This is another critical architecture feature.

Your worker should not render from:

```text
~/Projects/MyProject/
```

while you are changing it.

Instead use Git worktrees.

Git officially supports adding a separate worktree at a specific commit and using detached `HEAD` for such a checkout. citeturn17search2turn17search4

Your machine:

```text
~/Projects/remotion-production/
        ↑
        development tree


~/RenderWorker/releases/
        ├── a813f7.../
        ├── c92ba1.../
        └── e73a19.../
             ↑
         immutable release worktrees
```

When a render arrives:

```bash
git -C ~/Projects/remotion-production fetch origin

git -C ~/Projects/remotion-production \
  worktree add --detach \
  ~/RenderWorker/releases/$GIT_SHA \
  $GIT_SHA
```

Then:

```text
Git SHA
   ↓
isolated worktree
   ↓
pnpm install --frozen-lockfile
   ↓
Remotion bundle
   ↓
cache bundle
   ↓
render
```

Cache key:

```text
Git SHA
+
lockfile hash
+
Node major
+
Remotion version
```

This lets you continue editing version B while the worker is safely rendering version A.

## MacBook Air M5 and heavy 4K60 Remotion rendering

### Your hardware is capable, but it must be tuned differently from a desktop workstation

Apple's 2026 M5 MacBook Air specification confirms the hardware class you described: a 10-core CPU using 4 high-performance “super” cores plus 6 efficiency cores, with an 8-core or 10-core GPU option, 153 GB/s memory bandwidth and 16 GB unified memory as a standard configuration. citeturn16search10turn17search47

The M5 also contains hardware-accelerated:

```text
H.264 decode/encode
HEVC decode/encode
ProRes decode/encode
ProRes RAW
AV1 decode
```

which is very useful for your video-production pipeline. citeturn16search10

However, Apple's M5 MacBook Air remains a **completely fanless machine**. citeturn17search1turn17search19

That distinction matters.

A short benchmark and a sustained one-hour render should not be assumed to have identical throughput. My inference from the fanless chassis and your workload is that your architecture should prioritize **sustained stability and memory control over maximizing concurrency for the first few minutes**. citeturn17search1turn16search10

### Your 4K60 workload is genuinely heavy

One 3840 × 2160 frame contains:

```text
8,294,400 pixels
```

At 60 FPS:

```text
497,664,000 output pixel samples / second
```

A 10-minute project is:

```text
60 fps × 600 seconds
=
36,000 frames
```

That is before considering:

```text
SVG filters
shadows
masks
motion blur
multiple video layers
4K source decoding
Three.js rendering
particles
glass effects
large images
audio decoding
browser instances
encoding
```

So for your MacBook Air:

> **Do not run multiple simultaneous 4K60 production jobs.**

Use one job at a time.

Remotion can still parallelize frames *inside* that one job.

### Do not automatically set concurrency to 10 because you have a 10-core CPU

Remotion exposes configurable render concurrency, and its CLI documentation explicitly makes this a tunable rendering parameter. citeturn19search1

Your CPU is heterogeneous:

```text
4 high-performance cores
6 efficiency cores
```

and your 16 GB unified memory is shared across:

```text
CPU
GPU
Chromium
WebGL
Node
macOS
media caches
source decoding
render output
```

Apple confirms both the CPU topology and unified-memory configuration. citeturn16search10

I would start your empirical profiles at:

| Scene workload | Starting concurrency |
|---|---:|
| typography/SVG/diagram | 5 |
| D3 charts/infographics | 5 |
| SVG + multiple videos | 4 |
| Three.js / WebGL | 3 |
| 3D + multiple videos + effects | 2–3 |

These values are **benchmark starting points, not claimed M5 benchmark results**.

Build this script:

```text
benchmark-render.ts
```

and test:

```text
concurrency 2
concurrency 3
concurrency 4
concurrency 5
concurrency 6
```

against the exact same 15–30 second representative **4K60** scene.

Measure:

```text
wall-clock render time
memory pressure
swap used
Chrome crashes
peak Node memory
output correctness
temperature/sustained slowdown
```

Then save machine-specific profiles:

```json
{
  "machine": "macbook-air-m5-16gb-8gpu",
  "profiles": {
    "svg": {
      "concurrency": 5
    },
    "mixed": {
      "concurrency": 4
    },
    "three": {
      "concurrency": 3
    },
    "extreme": {
      "concurrency": 2
    }
  }
}
```

The worker automatically chooses a profile from the SceneSpec.

### Memory tuning is particularly important on your 16 GB configuration

This is one of the strongest findings from the Remotion documentation.

Remotion's current render CLI states that the decoded media cache defaults to **half the available system memory when rendering starts**. The `OffthreadVideo` frame cache similarly defaults to half the available system memory, and the documentation warns that increasing it uses more memory. The default OffthreadVideo video-thread count is two, with an explicit warning to increase carefully because excessive threading may cause instability. citeturn19search1

For a 16 GB machine, I would therefore explicitly constrain these values rather than rely on defaults.

Initial heavy-render profile:

```text
media cache                 2 GiB
OffthreadVideo cache        2 GiB
OffthreadVideo video threads 2
production render jobs       1
```

Conceptually:

```bash
npx remotion render \
  src/index.ts Main out.mp4 \
  --codec=h264 \
  --fps=60 \
  --concurrency=4 \
  --hardware-acceleration=if-possible \
  --media-cache-size-in-bytes=2147483648 \
  --offthreadvideo-cache-size-in-bytes=2147483648 \
  --offthreadvideo-video-threads=2
```

Do not assume 2 GB is permanently ideal. Benchmark 1–4 GB cache profiles and find the fastest point that does not trigger sustained memory pressure or swap.

### Use hardware encoding

Remotion currently supports hardware acceleration for encoding, including H.264, H.265 and ProRes on macOS. Hardware acceleration was introduced in Remotion 4.0.228. citeturn19search0

This pairs particularly well with the M5's hardware media engines. citeturn16search10

Use:

```text
hardwareAcceleration: "if-possible"
```

rather than `"required"` initially.

Recommended output profiles:

```text
PREVIEW
1920 × 1080
30 FPS
H.264


FINAL
3840 × 2160
60 FPS
H.264
hardware acceleration if possible


HIGH-EFFICIENCY DELIVERY
3840 × 2160
60 FPS
H.265
hardware acceleration if possible


CLIENT MASTER
3840 × 2160
60 FPS
ProRes
only when a master is genuinely required
```

Remotion's encoding documentation supports H.264, H.265, VP8, VP9, AV1 and ProRes server-side and documents macOS hardware acceleration for H.264, H.265 and ProRes. citeturn19search0turn19search2

One detail: Remotion notes that CRF is unavailable when hardware acceleration is enabled, so use appropriate bitrate controls instead. citeturn19search0

Hardware encoding will not magically make the entire composition hardware-accelerated. React, SVG, layout, Chromium painting, WebGL, effects and frame generation still have to happen. The hardware media engine principally helps supported encode/decode operations. citeturn19search0turn16search10

### Keep preview and final rendering separate

The dashboard should not render 4K60 every time you move a title by 20 pixels.

Use:

```text
EDITOR / PREVIEW
1920 × 1080
30 FPS
Remotion Player


FINAL
3840 × 2160
60 FPS
Mac render worker
```

Remotion's parameterized-video architecture allows video properties/content to be derived from input props and metadata, making separate preview/final profiles practical. citeturn19search25

All animation timing should therefore derive from:

```ts
const {fps} = useVideoConfig();
```

rather than assuming:

```ts
frame 60 = one second
```

everywhere.

### Run the worker as a macOS LaunchAgent

Apple's current Service Management documentation identifies LaunchAgents as processes run on behalf of the logged-in user and managed by `launchd`. citeturn17search0turn17search7

This is the correct operating model for:

```text
com.yourcompany.remotion-worker
```

The worker starts automatically, keeps running, heartbeats to the dashboard and restarts after an unexpected exit.

Conceptually:

```text
Login
 ↓
launchd
 ↓
Render Worker
 ↓
connect outbound
 ↓
heartbeat
 ↓
wait for jobs
```

Your dashboard can then display:

```text
RENDER MACHINE

MacBook Air M5
● ONLINE

CPU        10-core M5
GPU        8-core
RAM        16 GB
Worker     v1.8.2
Job        Idle
Last seen  3 seconds ago
```

## Remotion-only creative system and all previous research points

Your newer requirement changes one part of the original research substantially:

> You do **not** want Blender, After Effects and a large collection of heavy applications.

I agree with simplifying it.

For your system, the creative stack should now be:

```text
                         REMOTION
                            │
       ┌────────────────────┼───────────────────┐
       │                    │                   │
       ▼                    ▼                   ▼
 React + SVG             D3 geometry       Three.js / R3F
       │                    │                   │
       │                    │                   │
 typography              charts             3D icons
 diagrams                networks           product forms
 illustration            hierarchy          extrusion
 masks                    maps               particles
 paths                    scales             cameras
       │                    │                   │
       └────────────────────┼───────────────────┘
                            ▼
                     Remotion timeline
                            ↓
                         audio
                            ↓
                         render
```

Remotion itself already provides Shapes, SVG path interpolation, Three.js integration, server-side rendering and a large API surface around media and video creation. citeturn20search22turn18search8turn18search0turn15search0

D3 is a good auxiliary dependency specifically because much of it can operate as geometry/math without owning the DOM, and its official documentation explicitly notes that modules such as scales, arrays and interpolation can be used normally with React. D3's shape, hierarchy and force modules can calculate paths and layouts that you then render through SVG. citeturn17search32turn17search35turn17search27turn17search30

For 3D, Remotion officially exposes `@remotion/three` for React Three Fiber scenes. citeturn18search0turn18search1

React Three Fiber can load glTF models, and Three.js itself provides both `GLTFLoader` and `SVGLoader`, which means you can build a useful 3D-icon workflow without requiring Blender for every asset. citeturn18search3turn18search6turn18search7

### The two auxiliary creative library groups

**Auxiliary stack A — D3**

```text
d3-array
d3-scale
d3-shape
d3-hierarchy
d3-force
d3-geo
d3-format
```

Use it for:

```text
charts
data graphics
maps
networks
hierarchies
tree layouts
radial layouts
arcs
lines
areas
scales
geometry
```

**Auxiliary stack B — Three.js / React Three Fiber**

```text
three
@react-three/fiber
@react-three/drei
@remotion/three
```

Treat those as one 3D stack.

Use it for:

```text
3D icons
GLB assets
procedural product forms
servers
databases
clouds
glass cards
extruded SVG
network visualization
lighting
particles
3D camera
technical scenes
```

### What is no longer required

| Heavy tool from earlier research | New status |
|---|---|
| Blender | **Removed from required stack** |
| After Effects | **Removed** |
| Cavalry | **Removed** |
| Motion Canvas | **Removed** |
| Rive | **Removed as dependency** |
| Lottie authoring | **Removed as dependency** |
| Premiere Pro | **Removed** |

A supplied GLB, Lottie or video can still be accepted as an **asset format** when useful; you simply do not need those applications to operate your pipeline.

### Coverage of all thirty-three original research points

None of the earlier concepts need to disappear. The implementation changes so they are built inside Remotion.

| Point | System capability | Final implementation |
|---:|---|---|
| 1 | Professional animation pipeline | Information → visual concept → objects → motion → camera → audio → render |
| 2 | Multiple animation engines | Typography, shape, diagram, data, illustration, 3D, camera, effects, audio |
| 3 | SVG-first graphics | React SVG + Remotion Shapes/Paths |
| 4 | Infographic engine | D3 geometry + SVG + Remotion timing |
| 5 | Diagram engine | Nodes, connectors, ports, packets, flows |
| 6 | Illustration animation | Layered React/SVG illustrations |
| 7 | 3D icons | `@remotion/three` + R3F |
| 8 | Complex 3D | Procedural Three.js / GLB instead of Blender |
| 9 | Procedural 2D formerly Cavalry | Reusable Remotion generators |
| 10 | Compositing formerly AE | Remotion masks/effects/SVG/transitions |
| 11 | Stateful vector motion formerly Rive | React state/variant components |
| 12 | Packaged animation formerly Lottie | Native reusable Remotion/SVG modules |
| 13 | Motion Canvas concept | Remotion remains sole timeline |
| 14 | Three.js animation | Frame-derived Three.js transformations |
| 15 | Final tool stack | Remotion + D3 + Three/R3F |
| 16 | Overall renderer architecture | Scene JSON → render engines → Remotion |
| 17 | Visual semantic engine | Entities + relationships + transformations |
| 18 | Scene classification | HERO/PROCESS/DATA/MAP/NETWORK/etc. |
| 19 | Component library | Reusable TSX production modules |
| 20 | Motion grammar | reveal/trace/morph/assemble/flow/etc. |
| 21 | Avoid preset syndrome | Primary + secondary + ambient motion |
| 22 | Scene choreography | Multiple animation beats per scene |
| 23 | Camera engine | pan/push/pull/follow/parallax/reframe |
| 24 | Motion blur | Selective Remotion blur |
| 25 | Audio-driven animation | VO timestamps → animation cues |
| 26 | Sound-design engine | Semantic SFX events |
| 27 | Visual-style profiles | Central design tokens/art direction |
| 28 | AI boundary | AI plans; deterministic engine renders |
| 29 | File strategy | SVG/JSON/GLB/WAV/MP4/ProRes |
| 30 | QC | Automated visual + technical validation |
| 31 | Implementation roadmap | Phased architecture below |
| 32 | Scene JSON | Versioned semantic scene contract |
| 33 | Core philosophy | Meaning → visual metaphor → choreography |

### Your actual animation engine

Do not make the AI say:

```text
animate element A with slide-up
animate element B with fade-in
```

Instead:

```text
SCRIPT
   ↓
SEMANTIC ANALYSIS
   ↓
ENTITIES
   ↓
RELATIONSHIPS
   ↓
TRANSFORMATION
   ↓
VISUAL METAPHOR
   ↓
SCENE TYPE
   ↓
RENDERER
   ↓
CHOREOGRAPHY
```

Example:

> “The API gateway authenticates the request before forwarding it.”

Semantic output:

```json
{
  "sceneType": "PROCESS",
  "visualIntent": "explain authenticated request routing",
  "entities": [
    "client",
    "request",
    "gateway",
    "security-shield",
    "backend-service"
  ],
  "relationships": [
    "client -> gateway",
    "gateway -> service"
  ],
  "transformation": "unauthenticated -> authenticated",
  "visualization": "process-flow"
}
```

Then choreography:

```text
client appears
     ↓
request packet launches
     ↓
connector draws
     ↓
packet reaches gateway
     ↓
camera pushes toward gateway
     ↓
security shield closes
     ↓
packet color/state changes
     ↓
backend connector activates
     ↓
authenticated packet continues
```

That produces actual explanatory motion rather than PowerPoint-style element entrances.

### SVG is your main 2D renderer

SVG becomes the base layer for:

```text
illustrations
arrows
paths
diagrams
maps
charts
icons
masks
callouts
connectors
line drawing
morphing
gradients
technical UI
```

Remotion currently exposes SVG shape generation through `@remotion/shapes`, including arrows, rectangles, callouts, circles, pies, polygons and other primitives. citeturn20search22

Its current Paths API can interpolate between SVG paths across keyframes, including easing and clamped extrapolation. citeturn18search8

So:

```text
SVG icon A
    ↓
interpolatePaths()
    ↓
SVG icon B
```

can be a deterministic frame-based transformation.

### D3 should calculate; Remotion should animate

Correct:

```text
DATA
 ↓
D3
 ↓
geometry
 ↓
SVG
 ↓
Remotion frame
 ↓
animation
```

Not:

```text
D3 timer
 ↓
browser transition
```

This distinction is important because Remotion renders arbitrary frames and needs frame-deterministic state.

D3's official documentation describes its shape generators as producing geometry such as SVG `d` path values, while D3 Force can calculate node positions for rendering in SVG or Canvas. citeturn17search35turn17search27

### 3D icons without Blender

A very useful new approach for you is:

```text
2D SVG
  ↓
Three.js SVGLoader
  ↓
Shape geometry
  ↓
depth/extrusion
  ↓
material
  ↓
lights
  ↓
camera
  ↓
3D icon
```

Three.js officially provides an SVG loader that parses SVG paths into shape data. citeturn18search7

Or:

```text
prebuilt GLB
 ↓
GLTFLoader
 ↓
React Three Fiber
 ↓
@remotion/three
 ↓
frame-based camera + object animation
```

Three.js's `GLTFLoader` supports glTF 2.0 and many common extensions, while React Three Fiber exposes the standard loader pattern for glTF scenes. citeturn18search6turn18search3

Your library can therefore contain:

```text
Server3D
Database3D
Cloud3D
Router3D
Phone3D
Chip3D
Shield3D
Globe3D
Wifi3D
Stack3D
Arrow3D
Currency3D
AIOrb3D
```

without requiring a separate 3D DCC application for everyday production.

### Scene library

Build reusable classes:

```text
HERO
EXPLAIN
PROCESS
COMPARISON
DATA
TIMELINE
MAP
NETWORK
SYSTEM
ZOOM_IN
CUTAWAY
ILLUSTRATION
THREE_D
UI_DEMO
QUOTE
SUMMARY
TRANSITION
```

Then:

```text
Narration
   ↓
scene classifier
   ↓
renderer family
```

Example:

```text
"Data travels from India to servers around the world."

Scene class: MAP

Renderer:
GeoFlowScene

Components:
India map
world map
network nodes
route curves
data packets

Animation:
map reveal
route trace
packet follow
destination pulses
camera push
```

### Motion grammar

Your engine needs verbs rather than hundreds of unrelated presets.

```text
REVEAL
fade
slide
scale
maskReveal
draw
morph
depthReveal

EMPHASIS
pulse
glow
highlight
zoom
orbit
shake

EXPLANATION
tracePath
followPath
countUp
expand
assemble
transform
flow
connect
split
merge

EXIT
fade
collapse
wipe
push
zoomAway
```

Then a SceneSpec can contain:

```json
{
  "beats": [
    {
      "at": 0.3,
      "action": "reveal",
      "target": "client"
    },
    {
      "at": 1.2,
      "action": "tracePath",
      "target": "request"
    },
    {
      "at": 3.1,
      "action": "pulse",
      "target": "gateway"
    },
    {
      "at": 4.2,
      "action": "transform",
      "target": "request",
      "variant": "authenticated"
    }
  ]
}
```

### Avoid the automated-video preset problem

Do not produce:

```text
everything:
opacity 0 → 1
translateY 40 → 0
spring
```

Instead every scene has:

```text
PRIMARY MOTION
story transformation

SECONDARY MOTION
supporting object movement

AMBIENT MOTION
subtle depth/life
```

For example:

```text
PRIMARY
request packet travels

SECONDARY
nodes activate as packet passes

AMBIENT
grid moves subtly
small particles drift
light moves across server
```

### Camera makes your flat diagrams cinematic

Even your SVG scenes should live inside a virtual camera system.

```text
wide overview
      ↓
push to subsystem
      ↓
follow packet
      ↓
macro view
      ↓
transition to next visual scale
```

Camera verbs:

```text
pan
push
pull
zoom
reframe
follow
parallax
whip
macro
orbit
```

For real 3D scenes, Remotion currently supports React Three Fiber through `@remotion/three`. citeturn18search0

### Audio must become part of the scene compiler

Ideal flow:

```text
VOICE
  ↓
word timestamps
  ↓
semantic phrase timestamps
  ↓
visual beats
  ↓
animation
  ↓
SFX
```

Example:

```text
"The request reaches the gateway."

0.00 request
0.72 reaches
1.22 gateway

VISUAL

0.00 packet materializes
0.20 packet begins moving
0.72 acceleration
1.22 gateway pulse
1.26 impact sound
```

That is how your generated explainers start feeling intentionally directed.

### File strategy

| Content | Format |
|---|---|
| vector illustrations | SVG |
| icons | SVG |
| charts | JSON → SVG |
| diagrams | JSON → SVG |
| maps | geo data → SVG |
| scene instructions | JSON |
| 3D objects | GLB/glTF |
| procedural 3D | TypeScript/Three |
| voice | WAV source |
| music | WAV source |
| SFX | WAV |
| regular final | H.264 MP4 |
| efficient final | H.265 |
| premium master | ProRes when necessary |

## Production reliability, security and implementation roadmap

### Do not let users submit executable Remotion source

The dashboard should submit:

```json
{
  "compositionId": "TechnologyExplainer",
  "inputProps": {},
  "sceneSpec": {},
  "renderProfile": "final-4k60"
}
```

Not:

```json
{
  "javascript": "..."
}
```

This is especially important because Remotion's newer browser-bundler documentation explicitly states that its code-execution environment is for **trusted code** and is not a security sandbox. citeturn20search4

Therefore the trust boundary should be:

```text
TRUSTED
Remotion templates
components
motion functions
Git commits on protected main

UNTRUSTED
user text
scene data
uploaded media
JSON
external URLs
```

Validate untrusted input with Zod or equivalent.

### Your final job record

Store:

```json
{
  "id": "render_uuid",
  "projectId": "project_uuid",
  "compositionId": "Main",
  "schemaVersion": 3,

  "gitSha": "a813f7...",

  "inputProps": {},
  "renderSettings": {
    "width": 3840,
    "height": 2160,
    "fps": 60,
    "codec": "h264",
    "hardwareAcceleration": "if-possible"
  },

  "worker": "mba-m5-main",

  "status": "rendering",
  "stage": "frames",
  "progress": 0.684
}
```

### QC must happen before `completed`

Technical validation:

```text
✓ output exists
✓ file is readable
✓ width = 3840
✓ height = 2160
✓ expected FPS
✓ expected duration
✓ audio exists if required
✓ output is not zero-byte
✓ checksum generated
✓ Blob upload finished
```

Visual checks:

```text
✓ no blank opening frame
✓ no missing SVG
✓ no missing font
✓ no missing 3D model
✓ no text overflow
✓ no invalid path
✓ no accidental clipping
✓ no objects outside safe area
✓ no NaN transform
✓ no scene stuck at initial animation state
```

Only then:

```text
status = completed
```

### Worker heartbeat and offline behavior

The Mac should report:

```json
{
  "workerId": "mba-m5-main",
  "status": "idle",
  "currentJob": null,
  "lastSeen": "...",
  "gitSha": "...",
  "nodeVersion": "24.x"
}
```

If the Mac goes offline:

```text
Render job status:
QUEUED

NOT:
FAILED
```

When the Mac returns:

```text
worker boot
   ↓
heartbeat
   ↓
reconcile queued jobs
   ↓
resume processing
```

That means you can close the laptop, lose internet temporarily, reboot macOS or redeploy Vercel without losing queued work.

### Recommended regional architecture for India

Vercel currently lists `bom1` as its Mumbai region, while its default Function region for new projects is `iad1` in Washington, D.C. citeturn21search3turn21search9

Given that your Mac worker is in India, I would deliberately locate:

```text
Vercel API
+
Postgres
```

near each other and preferably closer to your primary operating geography, rather than blindly accepting the US default.

Rendering speed itself will not materially depend on this because the compute is on your Mac, but:

```text
worker heartbeat
job pickup
progress events
dashboard latency
DB writes
asset metadata
```

will benefit from sensible regional placement.

### Build phases

#### Foundation

```text
Node 24
pnpm workspace
Next.js app
Remotion package
TypeScript strict
GitHub
GitHub Actions
protected main
Vercel
custom domain
```

Goal:

```text
Local → PR → CI → Vercel Preview → main → production domain
```

#### Render-job backend

```text
Neon Postgres
render_jobs
render_events
render_workers
API contracts
authentication
render profiles
```

Goal:

```text
Live dashboard can create a durable render job.
```

#### Local Mac worker

```text
Node worker
LaunchAgent
heartbeat
job claim
Git worktree
locked install
bundle cache
renderMedia()
progress
cancel
error handling
```

Goal:

```text
Click Render on live website
             ↓
MacBook begins rendering
```

#### Output storage

```text
local output
QC
checksum
multipart Blob upload
download
thumbnail
manifest
```

Goal:

```text
Rendered file appears in dashboard.
```

#### M5 benchmark system

Build:

```text
benchmark-render.ts
```

Test:

```text
concurrency:
2
3
4
5
6

cache:
1 GiB
2 GiB
3 GiB
4 GiB

scene types:
SVG
D3
video
Three.js
mixed
```

Create automatic machine profile.

#### Motion foundation

```text
design tokens
grid
type scale
safe area
spring
easing
stagger
path drawing
morphing
masking
camera
transitions
```

#### Infographics and diagrams

```text
D3
bars
lines
areas
donuts
process flows
networks
hierarchies
timelines
maps
funnel
comparison
callouts
```

#### Illustration

```text
layered SVG
object addressing
parallax
camera
highlights
path morph
```

#### 3D

```text
@remotion/three
R3F
Three.js
procedural icons
SVG extrusion
GLB loader
materials
lighting presets
camera presets
```

#### Audio system

```text
voice timings
captions
music
ducking
SFX
semantic audio events
```

#### Visual-director layer

```text
SCRIPT
  ↓
semantic analysis
  ↓
scene type
  ↓
visual intent
  ↓
entities
  ↓
relationships
  ↓
animation beats
  ↓
camera
  ↓
sound
  ↓
validated SceneSpec
```

#### Advanced reliability

Later add:

```text
priority queue
multiple workers
job scheduling
scene-level cache
render analytics
automatic visual regression
long-render chunking
worker update manager
asset deduplication
render cost/throughput analytics
```

### The final system

What I would actually build is:

```text
┌──────────────────────────────────────────────────────────┐
│                    CREATION LAYER                        │
│                                                          │
│ Script → Semantic Director → Scene JSON                  │
│                          │                               │
│             ┌────────────┼────────────┐                  │
│             ▼            ▼            ▼                  │
│           SVG           D3        Three/R3F              │
│             └────────────┼────────────┘                  │
│                          ▼                               │
│                       REMOTION                           │
└──────────────────────────┬───────────────────────────────┘
                           │
                           │ code
                           ▼
┌──────────────────────────────────────────────────────────┐
│                  DEVELOPMENT LAYER                       │
│                                                          │
│ Local Mac → GitHub → CI → Vercel Preview → main         │
│                                      ↓                   │
│                              Production Domain           │
└──────────────────────────┬───────────────────────────────┘
                           │
                           │ render request
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    CONTROL LAYER                         │
│                                                          │
│ Vercel API → Postgres → Queue                            │
│     ▲                │                                   │
│     │                ▼                                   │
│     │           Render Job ID                            │
└─────┼───────────────────┬────────────────────────────────┘
      │                   │
      │ progress          │ outbound pull
      │                   ▼
┌─────┴────────────────────────────────────────────────────┐
│                    RENDER LAYER                          │
│                                                          │
│ MacBook Air M5                                           │
│ 16 GB / 10 CPU / 8 GPU                                   │
│                                                          │
│ Worker                                                   │
│   ↓                                                      │
│ exact Git SHA                                            │
│   ↓                                                      │
│ isolated worktree                                        │
│   ↓                                                      │
│ Remotion bundle                                          │
│   ↓                                                      │
│ ONE 4K60 job                                             │
│   ↓                                                      │
│ tuned frame concurrency                                  │
│   ↓                                                      │
│ hardware-assisted encoding                              │
│   ↓                                                      │
│ QC                                                       │
└──────────────────────────┬───────────────────────────────┘
                           │
                           ▼
                     Vercel Blob
                           │
                           ▼
                    Live Dashboard
```

The critical strategic decision is therefore:

> **Vercel never becomes your heavy renderer. It becomes the command center.**

And:

> **Your MacBook is not a public server. It is an authenticated outbound render worker.**

And for your creative pipeline:

> **Remotion remains the single production environment. D3 provides information-visualization geometry, while Three.js/React Three Fiber provides 3D. Blender, After Effects and the other heavy desktop applications are not required.**

This preserves every important capability from the previous thirty-three-point animation research—infographics, diagrams, motion graphics, illustrations, 3D icons, visualization, semantic animation, camera, sound, style systems and QC—while reducing the authoring stack to something you can actually automate end-to-end in TypeScript. Remotion's current APIs provide the critical server renderer, parameterized video architecture, SVG/path tooling and Three.js integration needed for that direction. citeturn15search0turn19search25turn20search22turn18search8turn18search0

**[Download the complete 60 KB Markdown implementation plan](sandbox:/mnt/data/remotion_m5_vercel_local_render_deep_research_plan.md)**