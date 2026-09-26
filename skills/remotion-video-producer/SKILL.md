---
name: remotion-video-producer
description: End-to-end pipeline for high-end programmatic video with Remotion (the React video framework) that builds platform-ready MP4s for YouTube long-form (16:9) and Shorts (9:16), Instagram Reels / Feed / Stories, and Facebook Reels / Feed. Covers cinematic motion design (springs, kinetic typography, camera moves, transitions, light leaks, WebGL effects, motion blur, 3D), AI voiceover (ElevenLabs / OpenAI TTS) with auto-synced scene durations, word-level animated captions, music ducking and SFX, platform safe zones, multi-format rendering (local or AWS Lambda) and a QA pass. ALWAYS use this skill when the user says 'start Remotion', mentions Remotion, or wants to make, edit, animate, caption, voice or render any video with code, such as a reel, Short, explainer, promo, ad, intro, trailer, lower third, kinetic-text piece, product demo, 'video from this script', even if Remotion is never named. Also use it to add voiceover, captions or motion graphics to an existing Remotion project.
---

# Remotion Video Producer

You are the technical director on a motion-graphics job. The deliverable is a rendered file that looks like an agency made it, not a demo that "shows Remotion works". Every phase below exists because skipping it produces a video that feels cheap: flat motion, text under the platform UI, a voiceover that ends before the scene does, captions that drift.

Remotion renders React components frame by frame in headless Chrome and encodes them with FFmpeg. Anything you can draw in the browser (CSS, SVG, Canvas, WebGL, Three.js) becomes video. The one law: **a frame must be a pure function of `useCurrentFrame()`**. Random values, CSS transitions, timers, and `useEffect` animations break under parallel rendering. See `references/remotion-api.md` for the full rule set.

## Before you start

Read this section, then load only the reference files the job needs. They are listed at the bottom with "read when" guidance.

Pick the production lane:

| User has | Lane |
|---|---|
| A topic or brief only | Full pipeline: write script -> voiceover -> build -> captions -> render |
| A script | Skip writing; start at voiceover |
| Voiceover audio already | Skip TTS; run `scripts/audio-durations.mjs` then transcribe for captions |
| Footage / AI-generated clips + a plan | Edit lane: `TransitionSeries` of clips, overlays, captions, music |
| An existing Remotion project | Respect its structure; add only what is asked; never overwrite user edits |

Confirm the brief items you cannot infer, but do not block on them. Reasonable defaults: 30 fps, 1080x1920 for vertical, 1920x1080 for horizontal, ElevenLabs for voice, Inter or a brand font, 20 to 45 s for Shorts/Reels, 3 to 8 min for long-form.

## Local machine profile

The default target is a fanless Apple Silicon laptop (MacBook Air M5, 10 CPU cores, 8 GPU cores, 16 GB unified memory, 512 GB SSD). The config template detects the machine at startup and sets `angle` (ANGLE on Metal) for WebGL and a concurrency of `min(cores / 2, memoryGB / 4)`, which is 4 tabs on 16 GB. Run `scripts/machine-check.sh --render-test <composition>` once per project to confirm the backend and timing on the real hardware. Memory, not cores, is the limit: quit Studio during finals, use 2 tabs for 4K, and prefer the `--hw` VideoToolbox mode of the preset script for long-form so the CPU stays cool. Whisper models and binaries live in a shared cache under `~/.cache/remotion-whisper` so projects stay small on the 512 GB drive. Details, storage budget and time estimates are in `references/local-machine.md`.

## The pipeline

### Phase 1 - Project

If no Remotion project exists, run `scripts/scaffold.sh <dir> [package-manager]`. It creates a blank project with `create-video`, installs the packages this skill uses, copies `assets/templates/` into place and writes `remotion.config.ts` (WebGL backend, BT.709 color, quality defaults). If a project exists, only `npx remotion add <pkg>` what is missing. Always use `npx remotion add` for `@remotion/*`, `mediabunny` and `zod` so versions stay aligned. Check the version with `npx remotion versions`.

Register one composition per platform format in `src/Root.tsx` inside `<Folder>`s. The same scene components render at every size; only `width`, `height` and layout tokens change. Never hardcode pixel positions that assume one aspect ratio. Use `src/lib/platforms.ts` (copied from templates) for dimensions and safe zones.

### Phase 2 - Script and scene plan

Turn the brief into a scene list before touching JSX. For each scene write: id, on-screen headline, voiceover line, visual intent, and target duration. Save it as `public/script/<video-id>.json`. This file drives voiceover, `calculateMetadata` and captions, so the whole video re-times itself when a line changes.

Pacing rules that separate professional cuts from amateur ones:
- Shorts / Reels: hook in the first 1.5 s (visual change plus the boldest claim), a new visual beat every 2 to 4 s, no scene longer than 6 s, end on a loop-friendly frame or a hard CTA.
- Long-form: chapters of 45 to 90 s, a pattern interrupt (b-roll, kinetic stat, zoom) at least every 15 s, chapter cards with titles.
- Voiceover sets the clock. Scene duration = voiceover duration + 0.4 to 0.8 s of air, never shorter.

### Phase 3 - Voiceover

Run `scripts/generate-voiceover.mjs --script public/script/<id>.json --provider elevenlabs|openai|macos`. `macos` uses the free system voice to lock timing before spending credits; regenerate with ElevenLabs for the final. It writes one MP3 per scene to `public/voiceover/<id>/`, a `manifest.json` with durations in seconds, and (ElevenLabs) word-level `captions.json` from the timestamp alignment, so no transcription step is needed. Requires `ELEVENLABS_API_KEY` or `OPENAI_API_KEY` in `.env`; never paste keys into chat or code.

Voice direction matters as much as the model: pick the voice by genre (see `references/audio-voiceover.md`), set `stability` around 0.4 to 0.55 for narration, and write the script with punctuation that produces natural pauses. Regenerate a single scene with `--only scene-03`.

Wire durations with `calculateMetadata` (template `src/compositions/SocialVideo.tsx`): durations from the manifest become `durationInFrames` per scene, the sum minus transition overlaps becomes the composition length.

### Phase 4 - Build scenes

Each scene is its own file under `src/scenes/` and is also registered as its own `<Composition>` (the "connected composition" pattern) so it can be previewed and tweaked alone in Studio. Assemble with `<TransitionSeries>`; hardcode `durationInFrames` on each sequence (Studio can then drag them), or feed them from the voiceover manifest.

Build order inside a scene: background layer -> media/hero -> typography -> accents (shapes, particles, light leak) -> captions layer (global, on top). Use the template components in `src/components/` as the starting vocabulary: `KineticTitle`, `LowerThird`, `KenBurnsImage`, `GradientBackground`, `LightLeakOverlay`, `MusicBed`, `CaptionLayer`, `SafeArea`.

The motion bar is in `references/motion-design.md`. The short version: every element enters with a spring or an ease-out bezier over 0.25 to 0.5 s, elements stagger by 2 to 4 frames, scale animations use `output: 'perceptual-scale'`, nothing moves linearly, camera (the whole scene container) drifts or pushes in slowly so static shots never feel static, and transitions are short (10 to 18 frames) and motivated.

Load fonts with `@remotion/google-fonts` or `@remotion/fonts` and only the weights used. Put assets in `public/` and reference them with `staticFile()`. Use `<Video>` and `<Audio>` from `@remotion/media`, `<CanvasImage>` or `<Img>` for images, `premountFor` on any sequence that contains media.

Preview constantly: `npx remotion studio --no-open` and open the printed URL, or render single frames with `npx remotion still <id> out/check.png --frame=45` when no browser is available. Look at at least three frames per scene (entry, middle, exit) before moving on.

### Phase 5 - Captions

Word-level captions are expected on every vertical video and most long-form talking segments. Sources, in order of preference:
1. ElevenLabs alignment produced in Phase 3 (already `Caption[]`).
2. `scripts/transcribe-whisper.mjs` (local Whisper.cpp, free, offline).
3. `scripts/transcribe-cloud.mjs --provider openai|elevenlabs` (fast, needs a key).

Render with the `CaptionLayer` template: `createTikTokStyleCaptions()` groups words into pages; the layer highlights the spoken word, sits inside the platform safe zone, and offers three looks (`karaoke`, `pop`, `boxed`). Details and tuning in `references/captions.md`. Keep captions to 1 to 2 lines, 3 to 5 words per page for Shorts, up to 8 for long-form.

### Phase 6 - Audio mix

Three buses: voiceover at 0 dB, music ducked to roughly -14 to -18 dB under speech (the `MusicBed` template reads the voiceover manifest and dips automatically), SFX at -6 to -10 dB on transitions and emphasis beats. Use `@remotion/sfx` constants (`whoosh`, `whip`, `ding`, `switch`, ...) rather than hunting for files. Fade music out over the last 1 to 2 s. Never let two voice clips overlap.

### Phase 7 - QA pass

Run through this list before rendering; each item is a common reason a client rejects a cut.
- Safe zones: toggle the `SafeArea` overlay (`debug` prop) and confirm no text under the platform UI at any frame.
- Timing: no scene ends before its voiceover; no hard cut in the middle of a word.
- Determinism: no `Math.random()`, `Date.now()`, CSS `transition` / `animation`, Tailwind `animate-*`, or `useFrame()` from React Three Fiber.
- Assets: every `fetch` or font load is wrapped in `delayRender()` or uses a Remotion loader.
- Type check: `npx tsc --noEmit`. Composition list: `npx remotion compositions`.
- Spot renders: `npx remotion still` for the first frame, a mid-scene frame and the last frame of the video.

### Phase 8 - Render and deliver

Use `scripts/render-preset.sh <composition-id> <preset> [--hw]` with presets `youtube-1080p`, `youtube-4k`, `shorts`, `reels`, `stories`, `facebook`, `feed`, `preview`, `prores`. Presets set codec H.264, CRF 16 to 18, `--color-space=bt709`, AAC 256 to 320 kbps, `yuv420p`, and pick concurrency from the machine's memory. `--hw` switches to VideoToolbox hardware encoding with a bitrate, the right choice for long-form and repeated drafts on the laptop; software CRF stays the choice for short finals. Export `REMOTION_GL=swangle` first on any machine without a GPU (Docker, CI, cloud sandboxes); the config file and the script both honor it. Full flag reference and Lambda / cloud rendering are in `references/rendering.md`. Deliver every requested format from the same project; do not re-author scenes per platform.

Name outputs `<video-id>_<platform>_<WxH>.mp4` in `out/`. Also render a 1280x720 or 1080x1920 thumbnail still if the platform benefits from one (YouTube always does).

## Non-negotiable Remotion rules

- Animate only from `useCurrentFrame()` via `interpolate()` or `spring()`. Clamp with `extrapolateLeft/Right: 'clamp'` unless you want the value to continue.
- Inside a `<Sequence>` the frame counter restarts at 0; do timing math relative to the sequence, not the composition.
- Keep `interpolate()` calls inline in `style` and use `scale`, `translate`, `rotate` CSS properties (not a `transform` string) on hero elements so Remotion Studio can keyframe them. Give elements a `name`.
- Keep `<Composition>` metadata and `defaultProps` inline in `Root.tsx`; put only dynamic values in `calculateMetadata`.
- Media: `<Video>` / `<Audio>` from `@remotion/media`; `trimBefore` / `trimAfter` in frames; `from` to delay; `volume` may be a function of the media's own frame.
- Transitions shorten the timeline: total = sum(scenes) - sum(transitions). Overlays do not.
- Effects (`@remotion/effects`), shader transitions, light leaks and motion blur need WebGL. `remotion.config.ts` (from the scaffold) picks `angle` on a desktop GPU and `swangle` when `REMOTION_GL=swangle` or `CI` is set; Docker, cloud VMs and this kind of sandbox need `swangle`. Verify with one still before a long render. The templates keep WebGL extras opt-in (`webglExtras` prop) so the base render never depends on GL.
- Add packages with `npx remotion add`, never a bare `npm i @remotion/x`, to avoid version mismatch.
- Do not overwrite edits the user made outside the conversation. If a file changed unexpectedly, assume it was intentional.

## Files in this skill

Scripts (`scripts/`, Node 20+, no build step):
- `scaffold.sh` - new project with all packages, templates and config.
- `generate-voiceover.mjs` - per-scene TTS (ElevenLabs with word timestamps, or OpenAI), manifest and captions.
- `audio-durations.mjs` - durations manifest for voiceover you were given.
- `transcribe-whisper.mjs` - local Whisper.cpp to `Caption[]` JSON.
- `transcribe-cloud.mjs` - OpenAI Whisper API or ElevenLabs Scribe to `Caption[]` JSON.
- `render-preset.sh` - platform render presets with machine-aware concurrency and a `--hw` hardware-encoding mode.
- `machine-check.sh` - prints the machine profile and recommended settings; `--render-test <id>` proves the GL backend.
- `lib/alignment.mjs`, `lib/script-schema.mjs` - shared helpers.

Templates (`assets/templates/`): `remotion.config.ts`, `src/lib/platforms.ts`, `src/lib/motion.ts`, `src/components/*.tsx`, `src/scenes/*.tsx`, `src/compositions/SocialVideo.tsx`, `src/Root.example.tsx`, `public/script/example.json`. They type-check, lint and render against Remotion 4.0.529 (verified with `npx remotion render` on `angle` and `swangle`). Copy, then adapt; do not import from the skill directory.

References (`references/`), read when:
- `remotion-api.md` - always, on first use in a session: the API cheat sheet and determinism rules.
- `platform-specs.md` - choosing sizes, safe zones, durations, bitrates for YouTube, Shorts, Reels, Stories, Facebook.
- `motion-design.md` - designing any animation: easing vocabulary, kinetic type, camera, transitions, effects catalog, 3D, particles.
- `visual-design.md` - typography, color, backgrounds, image and footage treatment, brand systems, AI-asset ingestion.
- `audio-voiceover.md` - TTS provider choice and settings, music, ducking, SFX, audio visualization, loudness.
- `captions.md` - transcription options, caption styling, sync fixes.
- `rendering.md` - CLI flags, quality presets, stills, GIFs, transparent video, Lambda and other cloud renders.
- `local-machine.md` - Apple Silicon laptop profile: GL, concurrency, hardware encoding, memory, thermals, storage budget, local Whisper and TTS.
- `troubleshooting.md` - flicker, fonts, WebGL, media decode errors, timeouts, Studio quirks.

If a Remotion API is not covered here, fetch the current doc page as Markdown by appending `.md` to its URL (for example `https://www.remotion.dev/docs/spring.md`) instead of trusting memory. The API moves fast.
