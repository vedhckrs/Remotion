---
name: remotion-video-producer
description: End-to-end pipeline for high-end programmatic video with Remotion (the React video framework) that builds 4K 60 fps masters for YouTube long-form and Shorts, Instagram Reels / Feed and Facebook Reels / Feed, all code, no AI video generation. Covers script analysis, ElevenLabs voiceover with word sync, viral captions, motion design (springs, kinetic type, 3D camera, neon, transitions, animated backgrounds), style presets, animated infographics, real brand logos and SVG icons with credits, grades and LUTs, music beds, thumbnails, per-platform SEO upload packs, scheduled publishing to YouTube / Instagram / Facebook, a daily autopilot (2 Shorts + 1 long video) and a local render dashboard on a machine budget. ALWAYS use this skill when the user says 'start Remotion', mentions Remotion, or wants to make, edit, animate, caption, voice, render, thumbnail, schedule or auto-publish any video with code (reel, Short, explainer, promo, ad, infographic, 'video from this script'), even if Remotion is never named.
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
| A topic package (episode folder with `production.json`) | Package lane: validate -> stills -> voice -> music -> cached render + QC. Local, no Claude calls. See `references/topic-packages.md` |
| A topic or brief only | Full pipeline: write script -> analyze -> voiceover -> build -> captions -> render |
| A script (Markdown or text) | `scripts/analyze-script.mjs` turns it into scene JSON; continue at voiceover |
| Voiceover audio already | Skip TTS; run `scripts/audio-durations.mjs` then transcribe for captions |
| Footage / stills + a plan | Edit lane: `TransitionSeries` of clips, grades, overlays, captions, music |
| An existing Remotion project | Respect its structure; add only what is asked; never overwrite user edits |

Defaults when the brief is silent: 60 fps, 1080-class composition captured at scale 2 for a 4K master, `fast` pacing for Shorts/Reels and `medium` for long-form, ElevenLabs `young-male-pro` voice, the `midnight-neon` style preset (which sets fonts, palette, Hormozi captions, grade and background system), 20 to 45 s for Shorts/Reels, 3 to 8 min for long-form.

## Local machine profile and budget

Target machine: fanless Apple Silicon laptop (MacBook Air M5, 10 CPU cores, 8 GPU cores, 16 GB unified memory, 512 GB SSD). The config template detects the machine at startup and applies a **performance budget of 50 percent by default** (`REMOTION_BUDGET`, or `--budget` on the preset script, or the slider in the dashboard): Chrome tab concurrency = cores x budget capped by memory / 4 (4 tabs at 1080p, 2 at 4K on 16 GB), and renders run under `nice -n 10` so Claude Code, Studio and your other apps stay responsive. WebGL uses `angle` (ANGLE on Metal) on macOS and `swangle` on Linux/CI. Hardware encoding (VideoToolbox) is one flag away for long-form. Run `scripts/machine-check.sh --render-test <composition>` once per project. Details in `references/local-machine.md`.

## The pipeline

### Phase 1 - Project

If no Remotion project exists, run `scripts/scaffold.sh <dir> [package-manager]`. It creates a blank project with `create-video`, installs the packages this skill uses (plus `simple-icons`), copies `assets/templates/` into place, writes `remotion.config.ts`, installs the local dashboard into `tools/dashboard`, generates the LUT set into `public/luts`, fetches the example icons, seeds `automation/` (queue, topic backlog, writer prompt), and adds npm scripts (`dashboard`, `machine-check`, `analyze`, `check`, `voice`, `captions`, `music`, `luts`, `render`, `icons`, `thumbs`, `pack`, `publish`, `auth-youtube`, `autopilot`, `autopilot:install`). If a project exists, only `npx remotion add <pkg>` what is missing. Check versions with `npx remotion versions`.

Compositions are registered per platform in `src/Root.tsx` inside `<Folder>`s at 60 fps; the same scene components render at every size. Never hardcode positions that assume one aspect ratio: use `src/lib/platforms.ts` (safe rect, logo slot, caption band, `unit` scale).

Start the control room with `npm run dashboard` (http://localhost:4545). Its **Episodes** tab loads a season plan (JSON: weeks → episodes → videos), lets the user pick week, episode, videos, aspect ratios (long videos 16:9 only; Shorts 9:16, 4:5 or 1:1) and a save folder, then produces each video as its own queued job (script from the episode folder or Claude Code, voice, music, thumbnails, one render per ratio, upload details, copy to the folder). Its **Upload details** tab shows every platform's title, description, tags and hashtags with Copy and Schedule buttons. The **Control room** tab has machine load and thermals, the budget slider, scripts, renders with real progress and cancel, the autopilot queue, outputs and Studio. See `references/dashboard.md`. Channel presets go in `src/lib/brand-styles.ts`; upgrade an existing project with `scripts/scaffold.sh <dir> --update`. `npm run dashboard:install` keeps the dashboard running in the background on macOS (starts at login, no Terminal).

### Phase 2 - Script and scene plan

Write the script as Markdown: `# Title`, one `## Headline` per scene, the voiceover sentences under it, `**word**` for the emphasized word, `> subline`, `- Label: 42%` lines (three or more) for a chart, `[neon]` / `[image: path]` / `[video: path]` / `[icons: youtube, logos:react, lucide:zap]` for the visual, `[speaker: Name | Role]` for a lower third, `[bg: spotlight]` for a per-scene background, `(delivery: excited)` for a TTS hint. Then:

```bash
npm run analyze -- script.md --id <videoId> --pacing fast --style midnight-neon --keywords "a, b" [--logo "brand"] [--music-mood energetic-tech]
npm run check -- public/script/<videoId>.json        # validates a hand-written JSON (schema, hook, timing, seo)
```

It writes `public/script/<videoId>.json` (schema in `scripts/lib/script-schema.mjs`) with headlines, highlights, chart and icon specs, style, pacing, voice settings, an `seo` block (titles, description, keywords, hashtags, thumbnail text: rewrite it, the analyzer only seeds it) and an estimated duration. This file drives voiceover, `calculateMetadata`, captions, thumbnails and the publish pack, so the whole video re-times itself when a line changes. Hand-editing the JSON (or the dashboard editor) is fine.

Style and concept: pick one preset per channel from `src/lib/styles.ts` (`midnight-neon`, `clean-corporate`, `hype-bold`, `luxury-noir`, `warm-editorial`, `tech-grid`, `paper-light`) and set `"style"` in the script; it fixes fonts, palette, caption style, grade, the animated background systems (one for talking scenes, a quieter one for data) and the thumbnail treatment, so every video of a channel looks like one series while each concept keeps its own accent and visuals. Add a preset when a client needs its own system; never restyle components ad hoc.

Brand marks and icons: name real tools and platforms with their real logos (`visual.type: "icons"`; Simple Icons slugs in official colors, SVG Logos for multicolor marks, Lucide / Tabler for UI icons, Fluent flat emoji for reactions). `npm run icons -- --from-script public/script/<videoId>.json` fetches them with licenses and brand hex into `public/icons/`. A small ownership line ("Logos ... are trademarks of their respective owners · Icons via Simple Icons (CC0)") is rendered while marks are on screen and repeated in every upload description. Rules in `references/icons-and-logos.md`.

Pacing rules: Shorts / Reels hook in the first 1.5 s, a new visual beat every 2 to 4 s, no scene over 6 s, end on a loop or CTA. Long-form: chapters of 45 to 90 s, a pattern interrupt at least every 15 s. Voiceover sets the clock: scene duration = voice + 0.35 s (fast), 0.6 s (medium) or 0.9 s (calm).

### Phase 3 - Voiceover

```bash
npm run voice -- --script public/script/<videoId>.json            # ElevenLabs, preset from the script
npm run voice -- --script ... --provider macos                    # free system voice for timing drafts
npm run voice -- --list-voices                                     # what your key can use
```

ElevenLabs runs through the with-timestamps endpoint, so every word's start and end is known: `manifest.json` (durations) and per-scene `captions` come back together and nothing is hand-timed. Presets: `young-male-pro` (default: male, young or middle-aged, narration / social, speed 1.08), `young-male-hype`, `male-deep-narrator`, `female-warm`, `female-energetic`; pin a `voiceId` in the script once a voice is approved. `eleven_v3` with `--tags` adds delivery tags per scene. Keys live in `.env`; never in chat or code. Regenerate one scene with `--only scene-03`.

### Phase 4 - Build scenes

Scenes come from the script automatically: `VoiceoverScene` (animated background, image, LUT-graded video or neon 3D stage), `InfographicScene` (bar, line, donut, stat), `IconScene` (hero mark, VS comparison, logo grid), lower thirds from `scene.speaker`, and the end card, assembled by `SocialVideo` inside a `ThemeProvider` built from the style preset, with pacing-aware transitions (`pickTransition`: zoom punch / push cut / whip pan / glitch for fast, fades for calm), impact flashes on fast cuts, the grade wrapper, the logo badge, the logo credit line and the music bed. Props `style`, `accent`, `captionStyle`, `grade`, `background` default to `auto` (preset) and can be overridden per composition. Custom scenes are ordinary React files under `src/scenes/` registered as their own compositions for Studio.

Backgrounds are motion graphics on one hue, never flat and never multi-color gradients: `Background kind=` `solid`, `tonal` (a soft light drifting; the premium default), `spotlight` (one accent glow), `grid` (perspective floor), `dots` (pulse matrix), `particles`, `rays`, `waves`, `streaks` (speed lines), `paper` (grain); all CSS/SVG, deterministic, themed. Presets choose one for talking scenes and a quieter one for data; a scene overrides with `visual.background`. The color belongs to the subject (type, icons, data), the field stays quiet.

Legibility is computed: `lib/color.ts` derives text, muted, surface, line, scrim and `onAccent` from the background luminance (white type on black, near-black on cream), pushes accents and highlight words to at least 3:1, and swaps a brand mark to mono when its official color would vanish on the tile. Never hardcode `#fff` or a grey; read `theme.colors.*`.

Motion is fluid by default: text and icons condense into place (rise + de-blur + settle on the emphasized-decelerate curve, natural stagger, no overshoot), exits accelerate away, held elements breathe, and cuts use the fluid transition catalog (`smoothFade`, `glideSlide`, `liquidWipe`, `irisReveal`). Switch a hype video to `transitions: 'hard'` (slams, whips, glitch) or `KineticTitle motion="punch"` deliberately, not by default.

Component vocabulary in `src/components/`: `KineticTitle`, `NeonText`, `Camera3D` + `Layer` + `Card3D`, `charts/BarChart | LineChart | DonutChart`, `Counter`, `LowerThird`, `Icon` / `BrandLogo` / `AttributionBar`, `Background`, `KenBurnsImage`, `LutVideo` / `LutImage`, `LightLeakOverlay`, `ImpactFlash`, `LogoBadge`, `MusicBed`, `CaptionLayer`, `EndCard`, `SafeArea`. Libraries: `lib/motion.ts` (EASE, SPRING, PACING, `fr()` frame scaling), `lib/styles.ts` (presets), `lib/theme.ts` (`ThemeProvider`, `useTheme`, fonts), `lib/grades.tsx` (CSS + effect + LUT grades), `lib/transitions.tsx`, `lib/platforms.ts`, `lib/script.ts`. Every component reads colors and fonts from `useTheme()`; never hardcode a brand color in a component.

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

Or queue from the dashboard ("All platforms"). Presets set H.264, CRF 16 to 18 (or 12 to 60 Mbps in hardware mode), BT.709, `yuv420p`, AAC 256 to 320 kbps. `--4k` captures at scale 2 and halves concurrency; `--hw` is for long-form and repeated drafts; `--background` (macOS) runs on efficiency cores for overnight batches. Outputs are `out/<Composition>_<preset>_<WxH>_4k.mp4` (or `--out out/<videoId>/<videoId>_shorts.mp4`, the layout autopilot uses). Render a different script with `--props='{"videoId":"<id>"}'`. Deliver every platform from the same project; never re-author scenes per platform. Full flags, Lambda and cloud in `references/rendering.md`.

### Phase 9 - Thumbnails, upload copy, publishing

```bash
npm run thumbs -- --video <videoId> [--variants "TEXT A|TEXT B"] [--image public/hero.jpg]   # 1280x720 + 1080x1920 cover + square, JPEG < 2 MB
npm run pack -- --video <videoId> --handle @you                                              # out/<id>/publish/{youtube,youtube-shorts,instagram,facebook}.json + titles.md
npm run publish -- --video <videoId> --platform youtube-shorts --when 2026-09-28T09:00:00+05:30 --dry-run
```

Thumbnails are `Still` compositions (`Thumbnail`, `Cover`, `SquareCover`) styled by the preset: 3 to 5 words from `seo.thumbnailText`, an accent block on the key word, the real brand marks from the script, the channel badge, the credit line. The publish pack shapes the `seo` block per platform (title under 70 characters, keyword in the first sentence, `#Shorts` first on Shorts only, chapters only when YouTube's 3 x 10 s rule holds, tags under 500 characters, 3 to 8 Instagram hashtags, 1 to 2 on Facebook, credits appended). `publish.mjs` uploads with scheduling: YouTube `private` + `publishAt`, Facebook Reels `SCHEDULED`, Instagram published at the slot by autopilot (no API scheduling). Credentials once via `npm run auth-youtube` and the Meta steps in `references/publishing-seo.md`; keys stay in `.env`.

### Phase 10 - Autopilot (2 Shorts + 1 long video a day)

```bash
npm run autopilot -- plan            # tomorrow's 3 items from automation/topics.md, slots 09:00 / 13:00 / 19:00, styles rotated
npm run autopilot -- run             # script (Claude Code headless) -> icons -> voice -> captions -> music -> thumbs -> 4K60 render -> pack -> scheduled uploads
npm run autopilot -- publish-due     # Instagram at its slot, retries
npm run autopilot:install            # launchd: nightly produce under caffeinate, publish-due every 30 min
```

Everything is idempotent and logged per item; `writer: "manual"` makes the queue wait for scripts you write in an interactive session instead of `claude -p`. Keep the backlog stocked and review `out/<id>/` in the dashboard for the first weeks. Details, limits and quotas in `references/automation.md`.

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
- `scaffold.sh` - new project with packages, templates, config, dashboard, LUTs and npm scripts; `--update` upgrades an existing one.
- `analyze-script.mjs` - Markdown or text script to scene JSON (headlines, highlights, charts, pacing, voice settings).
- `generate-voiceover.mjs` - ElevenLabs (word timestamps, voice presets, `--list-voices`, v3 tags), OpenAI, or macOS `say` drafts; manifest and captions.
- `audio-durations.mjs` - manifest for voiceover you were given.
- `transcribe-whisper.mjs` / `transcribe-cloud.mjs` - captions from local Whisper.cpp (shared cache) or OpenAI / ElevenLabs Scribe.
- `generate-music.mjs` - ElevenLabs Music bed of exact length, or the free-library list.
- `make-lut.mjs` - seven `.cube` LUTs matching the CSS grades.
- `fetch-icons.mjs` - real brand logos and SVG icon sets into `public/icons/` with `credits.json`.
- `make-thumbnails.mjs` - thumbnail, cover and square stills, JPEG under 2 MB, A/B variants.
- `make-publish-pack.mjs` - per-platform titles, descriptions, tags, hashtags, chapters, credits.
- `publish.mjs` / `auth-youtube.mjs` - scheduled uploads to YouTube, Instagram, Facebook; one-time OAuth.
- `autopilot.mjs` / `install-autopilot.sh` - daily plan / produce / publish queue and its launchd agents.
- `render-preset.sh` - platform presets with `--4k`, `--hw`, `--budget`, `--background`, `nice`.
- `machine-check.sh` - machine profile, recommended settings, GL render test.
- `validate-package.mjs` - topic package check: stage, errors, warnings, estimated and measured lengths, stale renders.
- `package-stills.mjs` - one storyboard picture per scene, kept until the scene changes.
- `package-voice.mjs` - ElevenLabs voice per chunk of whole scenes with measured word timing, chunk reuse, `--dry-run` cost; macOS draft.
- `package-music.mjs` - original seeded music bed made locally (-14 LUFS), or an imported track with its licence recorded.
- `package-thumbs.mjs` - 1280x720 and 1080x1920 thumbnails from `thumbs/thumbs.json`, offline, under 2 MB.
- `package-render.mjs` - scene-cached render (resume after a stop), sound at -14 LUFS / -1 dBTP, join, media QC, render manifest.
- `lib/` - alignment, env, media, script schema, package schema, audio (WAV, loudness), render kit helpers.

Dashboard (`assets/dashboard/`): `server.mjs`, `library.mjs` (topic packages), `episodes.mjs` (content-plan studio) and `index.html`, copied to `tools/dashboard/` by the scaffold. `assets/automation/plan.example.json` is a starter season plan. See `references/dashboard.md`.

Automation (`assets/automation/`): `queue.example.json`, `topics.example.md`, `writer-prompt.md`, copied to `automation/` by the scaffold.

Templates (`assets/templates/`): `remotion.config.ts`, `public/script/example.json`, `src/lib/*` (incl. `styles.ts`, `theme.ts`), `src/components/*`, `src/scenes/*`, `src/compositions/SocialVideo.tsx` + `Thumbnail.tsx`, `src/Root.example.tsx`. They type-check, lint and render against Remotion 4.0.529 at 60 fps on `angle` and `swangle`. Copy, then adapt; do not import from the skill directory.

References (`references/`), read when:
- `remotion-api.md` - always, on first use in a session: API cheat sheet and determinism rules.
- `local-machine.md` - setting up or tuning the laptop: budget, GL, encoding, memory, thermals, storage.
- `package-authoring.md` - writing a topic package (research, word budgets, narration, headlines, the 14 diagram kinds, beats, upload copy) so it validates first time; `assets/packages/demo-kinds/` shows every kind.
- `topic-packages.md` - producing from a topic package: folder layout, scene format, commands, what is kept, voice cost, free music, loudness and QC, the daily routine.
- `dashboard.md` - using or automating the local control room.
- `ecosystem.md` - choosing plugins and sources: component libraries, caption research, transitions, voices, LUTs, music libraries, render servers.
- `platform-specs.md` - sizes, safe zones, logo slots, durations, bitrates per platform.
- `motion-design.md` - designing any animation: fluid motion defaults, easing, kinetic type, camera and 3D rig, transitions, effects, neon, infographics.
- `visual-design.md` - typography, color theory for video (contrast rules, roles, no gradients), grades and LUTs, backgrounds, footage treatment, brand systems, style presets.
- `icons-and-logos.md` - brand marks and icon sets, the icon scene, trademark rules and the credit line.
- `publishing-seo.md` - thumbnails, per-platform copy rules, scheduling, API credentials and limits.
- `automation.md` - the daily autopilot: queue, writer, launchd, consistency, scaling.
- `audio-voiceover.md` - voice presets and direction, music and ducking, SFX, loudness.
- `captions.md` - caption sources, the six styles, sync fixes, SRT export.
- `rendering.md` - flags, presets, 4K60, stills, GIFs, alpha, Lambda and cloud.
- `troubleshooting.md` - flicker, fonts, WebGL, media, timeouts, disk, thermals.

If a Remotion API is not covered here, fetch the current doc page as Markdown by appending `.md` to its URL (for example `https://www.remotion.dev/docs/spring.md`) instead of trusting memory. The API moves fast.
