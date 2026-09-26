---
name: remotion-video-producer
description: End-to-end pipeline for high-end programmatic video with Remotion (the React video framework) that builds platform-ready 4K 60 fps masters for YouTube long-form (16:9) and Shorts (9:16), Instagram Reels / Feed / Stories, and Facebook Reels / Feed, entirely with code (no AI video generation). Covers script analysis, ElevenLabs voiceover with frame-accurate word sync, viral caption styles, cinematic motion design (springs, kinetic typography, 3D camera rig, neon glow, transitions, light leaks, WebGL effects, motion blur), animated infographics, color grades and LUTs, logo safe slots, music beds with ducking, a local render dashboard, and machine-budgeted rendering on a laptop. ALWAYS use this skill when the user says 'start Remotion', mentions Remotion, or wants to make, edit, animate, caption, voice or render any video with code, such as a reel, Short, explainer, promo, ad, intro, trailer, lower third, kinetic-text piece, product demo, infographic video, 'video from this script', even if Remotion is never named. Also use it to add voiceover, captions, charts or motion graphics to an existing Remotion project.
---

# Remotion Video Producer

You are the technical director on a motion-graphics job. The deliverable is a rendered 4K 60 fps master that looks like an agency made it, not a demo that "shows Remotion works". Every phase below exists because skipping it produces a video that feels cheap: flat motion, text under the platform UI, a voiceover that ends before the scene does, captions that drift.

Remotion renders React components frame by frame in headless Chrome and encodes them with FFmpeg. Anything you can draw in the browser (CSS, SVG, Canvas, WebGL, Three.js) becomes video. The one law: **a frame must be a pure function of `useCurrentFrame()`**. Random values, CSS transitions, timers and `useEffect` animations break under parallel rendering. See `references/remotion-api.md` for the full rule set.

Scope rule: this pipeline generates no video with AI models. Visuals are code (typography, shapes, charts, 3D rig, effects), footage and images the user supplies, or stock. Voice and music may come from ElevenLabs APIs.

## Before you start

Read this section, then load only the reference files the job needs. They are listed at the bottom with "read when" guidance.

Pick the production lane:

| User has | Lane |
|---|---|
| A topic or brief only | Full pipeline: write script -> analyze -> voiceover -> build -> captions -> render |
| A script (Markdown or text) | `scripts/analyze-script.mjs` turns it into scene JSON; continue at voiceover |
| Voiceover audio already | Skip TTS; run `scripts/audio-durations.mjs` then transcribe for captions |
| Footage / stills + a plan | Edit lane: `TransitionSeries` of clips, grades, overlays, captions, music |
| An existing Remotion project | Respect its structure; add only what is asked; never overwrite user edits |

Defaults when the brief is silent: 60 fps, 1080-class composition captured at scale 2 for a 4K master, `fast` pacing for Shorts/Reels and `medium` for long-form, ElevenLabs `young-male-pro` voice, Hormozi captions, Inter / Montserrat / Anton, 20 to 45 s for Shorts/Reels, 3 to 8 min for long-form.

## Local machine profile and budget

Target machine: fanless Apple Silicon laptop (MacBook Air M5, 10 CPU cores, 8 GPU cores, 16 GB unified memory, 512 GB SSD). The config template detects the machine at startup and applies a **performance budget of 50 percent by default** (`REMOTION_BUDGET`, or `--budget` on the preset script, or the slider in the dashboard): Chrome tab concurrency = cores x budget capped by memory / 4 (4 tabs at 1080p, 2 at 4K on 16 GB), and renders run under `nice -n 10` so Claude Code, Studio and your other apps stay responsive. WebGL uses `angle` (ANGLE on Metal) on macOS and `swangle` on Linux/CI. Hardware encoding (VideoToolbox) is one flag away for long-form. Run `scripts/machine-check.sh --render-test <composition>` once per project. Details in `references/local-machine.md`.

## The pipeline

### Phase 1 - Project

If no Remotion project exists, run `scripts/scaffold.sh <dir> [package-manager]`. It creates a blank project with `create-video`, installs the packages this skill uses, copies `assets/templates/` into place, writes `remotion.config.ts`, installs the local dashboard into `tools/dashboard`, generates the LUT set into `public/luts`, and adds npm scripts (`dashboard`, `machine-check`, `analyze`, `voice`, `captions`, `music`, `luts`, `render`). If a project exists, only `npx remotion add <pkg>` what is missing. Check versions with `npx remotion versions`.

Compositions are registered per platform in `src/Root.tsx` inside `<Folder>`s at 60 fps; the same scene components render at every size. Never hardcode positions that assume one aspect ratio: use `src/lib/platforms.ts` (safe rect, logo slot, caption band, `unit` scale).

Start the control room with `npm run dashboard` (http://localhost:4545). It shows machine load and thermals, the budget slider, scripts with their voice / caption / music status, queued renders with real progress and cancel, outputs with preview, and Studio start / stop. See `references/dashboard.md`.

### Phase 2 - Script and scene plan

Write the script as Markdown: `# Title`, one `## Headline` per scene, the voiceover sentences under it, `**word**` for the emphasized word, `> subline`, `- Label: 42%` lines (three or more) for a chart, `[neon]` / `[image: path]` / `[video: path]` for the visual, `(delivery: excited)` for a TTS hint. Then:

```bash
npm run analyze -- script.md --id <videoId> --pacing fast --voice-preset young-male-pro [--logo "brand"] [--grade teal-orange] [--music-mood energetic-tech]
```

It writes `public/script/<videoId>.json` (schema in `scripts/lib/script-schema.mjs`) with headlines, highlights, chart specs, pacing, voice settings and an estimated duration, and this file drives voiceover, `calculateMetadata` and captions, so the whole video re-times itself when a line changes. Hand-editing the JSON (or the dashboard editor) is fine.

Pacing rules: Shorts / Reels hook in the first 1.5 s, a new visual beat every 2 to 4 s, no scene over 6 s, end on a loop or CTA. Long-form: chapters of 45 to 90 s, a pattern interrupt at least every 15 s. Voiceover sets the clock: scene duration = voice + 0.35 s (fast), 0.6 s (medium) or 0.9 s (calm).

### Phase 3 - Voiceover

```bash
npm run voice -- --script public/script/<videoId>.json            # ElevenLabs, preset from the script
npm run voice -- --script ... --provider macos                    # free system voice for timing drafts
npm run voice -- --list-voices                                     # what your key can use
```

ElevenLabs runs through the with-timestamps endpoint, so every word's start and end is known: `manifest.json` (durations) and per-scene `captions` come back together and nothing is hand-timed. Presets: `young-male-pro` (default: male, young or middle-aged, narration / social, speed 1.08), `young-male-hype`, `male-deep-narrator`, `female-warm`, `female-energetic`; pin a `voiceId` in the script once a voice is approved. `eleven_v3` with `--tags` adds delivery tags per scene. Keys live in `.env`; never in chat or code. Regenerate one scene with `--only scene-03`.

### Phase 4 - Build scenes

Scenes come from the script automatically: `VoiceoverScene` (gradient, image, video or neon 3D stage), `InfographicScene` (bar, line, donut, stat), and the end card, assembled by `SocialVideo` with pacing-aware transitions (`pickTransition`: zoom punch / push cut / whip pan / glitch for fast, fades for calm), impact flashes on fast cuts, the grade wrapper, the logo badge and the music bed. Custom scenes are ordinary React files under `src/scenes/` registered as their own compositions for Studio.

Component vocabulary in `src/components/`: `KineticTitle`, `NeonText`, `Camera3D` + `Layer` + `Card3D`, `charts/BarChart | LineChart | DonutChart`, `Counter`, `LowerThird`, `KenBurnsImage`, `LutVideo` / `LutImage`, `GradientBackground`, `LightLeakOverlay`, `ImpactFlash`, `LogoBadge`, `MusicBed`, `CaptionLayer`, `EndCard`, `SafeArea`. Libraries: `lib/motion.ts` (EASE, SPRING, PACING, `fr()` frame scaling), `lib/grades.tsx` (CSS + effect + LUT grades), `lib/transitions.tsx`, `lib/platforms.ts`, `lib/theme.ts`, `lib/script.ts`.

The motion bar is in `references/motion-design.md`: every element enters with a spring or ease-out over 8 to 15 frames (at 30 fps; `fr()` scales to 60), siblings stagger 2 to 4 frames, scale uses `perceptual-scale`, nothing linear, the camera drifts or pushes so no shot is static, transitions are short and motivated, an exit precedes every entrance. Frame constants are authored at 30 fps and passed through `fr(n, fps)`.

Preview constantly in Studio (dashboard Start, or `npx remotion studio --no-open`), or render single frames with `npx remotion still <id> out/check.png --frame=120`. Look at entry, middle and exit of every scene.

### Phase 5 - Captions

Word-level captions come free from ElevenLabs alignment. Otherwise `npm run captions -- public/voiceover/<videoId>` (local Whisper.cpp on Metal, shared cache) or `scripts/transcribe-cloud.mjs --provider openai|elevenlabs`. `CaptionLayer` styles: `hormozi` (default: Montserrat 900, uppercase, black stroke, yellow active word), `pop`, `boxed`, `karaoke`, `outline` (Anton), `minimal`. It sits in the platform caption band. Details in `references/captions.md`.

### Phase 6 - Audio mix

Voice at 0 dB, music ducked under speech by `MusicBed` (reads the voice segments), SFX from `@remotion/sfx` on cuts and hits at -6 to -10 dB. Music: `npm run music -- --id <videoId> --mood energetic-tech` composes an instrumental of the exact length with ElevenLabs Music, or use a free library track (list printed when no key is set; check the license). Set `"music": {"src": "music/<file>", "level": 0.18}` in the script.

### Phase 7 - QA pass

- Safe zones: `showSafeArea: true` (props or Studio) and confirm no text under platform UI; logo in its slot; captions in the band.
- Timing: no scene ends before its voice; transitions never eat the first word.
- Determinism: no `Math.random()`, `Date.now()`, CSS `transition` / `animation`, Tailwind `animate-*`, `useFrame()`.
- Assets: every fetch and font wrapped by Remotion loaders or `delayRender()`.
- `npx tsc --noEmit`, `npx eslint src`, `npx remotion compositions`.
- Spot stills: hook frame, a chart mid-draw, a transition midpoint, the last frame.

### Phase 8 - Render and deliver (4K60 by default)

```bash
npm run render -- Shorts shorts --4k                      # 2160x3840 @ 60 fps, 50% budget, x264 CRF
npm run render -- YouTube youtube-1080p --4k --hw          # 3840x2160 @ 60 fps, VideoToolbox, long-form
npm run render -- Reels reels --4k --budget 80             # more of the machine when you step away
```

Or queue from the dashboard ("All platforms"). Presets set H.264, CRF 16 to 18 (or 12 to 60 Mbps in hardware mode), BT.709, `yuv420p`, AAC 256 to 320 kbps. `--4k` captures at scale 2 and halves concurrency; `--hw` is for long-form and repeated drafts; `--background` (macOS) runs on efficiency cores for overnight batches. Outputs are `out/<Composition>_<preset>_<WxH>_4k.mp4`. Deliver every platform from the same project; never re-author scenes per platform. Full flags, Lambda and cloud in `references/rendering.md`.

## Non-negotiable Remotion rules

- Animate only from `useCurrentFrame()` via `interpolate()` or `spring()`; clamp with `extrapolateLeft/Right: 'clamp'` unless you want the value to continue.
- Inside a `<Sequence>` the frame counter restarts at 0; do timing math relative to the sequence.
- Keep `interpolate()` inline in `style` and use `scale`, `translate`, `rotate` properties (not a `transform` string) on hero elements so Studio can keyframe them. Give elements a `name`.
- Keep `<Composition>` metadata and `defaultProps` inline in `Root.tsx`; put only dynamic values in `calculateMetadata`.
- Media: `<Video>` / `<Audio>` from `@remotion/media`; `trimBefore` / `trimAfter` in frames; `from` to delay; `volume` may be a function of the media's own frame.
- Transitions shorten the timeline: total = sum(scenes) - sum(transitions). Overlays do not.
- WebGL (effects, shader transitions, light leaks, LUT effect, motion blur) needs a backend: `angle` on a Mac, `swangle` without a GPU. The templates keep WebGL extras opt-in (`webglExtras`) and use CSS-only transitions and grades by default so a base render never depends on GL.
- Add packages with `npx remotion add`, never a bare `npm i @remotion/x`, to avoid version mismatch.
- Do not overwrite edits the user made outside the conversation.

## Files in this skill

Scripts (`scripts/`, Node 20+, no build step):
- `scaffold.sh` - new project with packages, templates, config, dashboard, LUTs and npm scripts.
- `analyze-script.mjs` - Markdown or text script to scene JSON (headlines, highlights, charts, pacing, voice settings).
- `generate-voiceover.mjs` - ElevenLabs (word timestamps, voice presets, `--list-voices`, v3 tags), OpenAI, or macOS `say` drafts; manifest and captions.
- `audio-durations.mjs` - manifest for voiceover you were given.
- `transcribe-whisper.mjs` / `transcribe-cloud.mjs` - captions from local Whisper.cpp (shared cache) or OpenAI / ElevenLabs Scribe.
- `generate-music.mjs` - ElevenLabs Music bed of exact length, or the free-library list.
- `make-lut.mjs` - seven `.cube` LUTs matching the CSS grades.
- `render-preset.sh` - platform presets with `--4k`, `--hw`, `--budget`, `--background`, `nice`.
- `machine-check.sh` - machine profile, recommended settings, GL render test.
- `lib/` - alignment, env, media, script schema helpers.

Dashboard (`assets/dashboard/`): `server.mjs` + `index.html`, copied to `tools/dashboard/` by the scaffold. See `references/dashboard.md`.

Templates (`assets/templates/`): `remotion.config.ts`, `public/script/example.json`, `src/lib/*`, `src/components/*`, `src/scenes/*`, `src/compositions/SocialVideo.tsx`, `src/Root.example.tsx`. They type-check, lint and render against Remotion 4.0.529 at 60 fps on `angle` and `swangle`. Copy, then adapt; do not import from the skill directory.

References (`references/`), read when:
- `remotion-api.md` - always, on first use in a session: API cheat sheet and determinism rules.
- `local-machine.md` - setting up or tuning the laptop: budget, GL, encoding, memory, thermals, storage.
- `dashboard.md` - using or automating the local control room.
- `ecosystem.md` - choosing plugins and sources: component libraries, caption research, transitions, voices, LUTs, music libraries, render servers.
- `platform-specs.md` - sizes, safe zones, logo slots, durations, bitrates per platform.
- `motion-design.md` - designing any animation: easing, kinetic type, camera and 3D rig, transitions, effects, neon, infographics.
- `visual-design.md` - typography, color, grades and LUTs, backgrounds, footage treatment, brand systems.
- `audio-voiceover.md` - voice presets and direction, music and ducking, SFX, loudness.
- `captions.md` - caption sources, the six styles, sync fixes, SRT export.
- `rendering.md` - flags, presets, 4K60, stills, GIFs, alpha, Lambda and cloud.
- `troubleshooting.md` - flicker, fonts, WebGL, media, timeouts, disk, thermals.

If a Remotion API is not covered here, fetch the current doc page as Markdown by appending `.md` to its URL (for example `https://www.remotion.dev/docs/spring.md`) instead of trusting memory. The API moves fast.
