# Ecosystem: open-source plugins, libraries and sources (researched September 2026)

What exists beyond this skill's templates, with licenses and how to pull it in. Everything here is
code-driven: Remotion, TypeScript, Node scripts and open data. No generative video models are used
anywhere in this pipeline; images and footage come from the user, stock or design tools, and motion
is authored in code.

Table of contents
1. Component libraries for Remotion
2. Infographics and data animation
3. Caption styles and typography
4. Transitions and effects
5. Voiceover: ElevenLabs, voice choice, sync
6. Logo and watermark placement
7. Neon, glow, 2.5D / 3D and camera
8. Color grading and LUTs
9. Background music: ElevenLabs Music and free libraries
10. Fast-paced presentation style
11. Render servers and dashboards
12. Policy: no AI video generation

## 1. Component libraries for Remotion

| Library | License | Install | What it adds |
|---|---|---|---|
| [remotion-bits](https://github.com/av/remotion-bits) | MIT | `npm i remotion-bits` or `npx remotion-bits find` | AnimatedText, gradient transitions, particles, 3D scenes, charts, camera presentations. Requires Remotion 4+. |
| [Onda](https://github.com/degueba/onda) | MIT | `npx ondajs add <component>` (copy-paste into `components/onda/`) | 70 components in 8 categories plus 18 `TransitionSeries` presentations: crossFade, morph, wipe, clockWipe, iris, flip, slide, push, zoom, chromaticAberration, gridPixelate, glassWipe, typeMask, devicePullback, expandMorph, blur, dipToColor, depthPush. Counters, bars, progress, pie, mesh gradients, grain. |
| [remotion-scenes](https://github.com/lifeprompt-team/remotion-scenes) | MIT | `npx degit lifeprompt-team/remotion-scenes` and copy scenes | 201 scenes: text (incl. neon and glitch), shapes, transitions, data/charts, effects, UI, logos, backgrounds, particles, cinematic, layouts, lists, text rollers, liquid. |
| [remocn](https://github.com/remocn/remocn) | MIT | `npx shadcn@latest add @remocn/<name>` | Registry of animations, transitions (zoom through, device mockup zoom, spatial push, frosted glass wipe, grid pixelate wipe), RGB glitch text, backgrounds, scenes. |
| [remotion-transitions (Ashad001)](https://github.com/Ashad001/remotion-transitions) | MIT | `npx skills add ashad001/remotion-transitions` | Striped slam, zoom punch, diagonal reveal, emerald burst, vertical shutter, glitch slam as `TransitionPresentation`s, with the animation math. |
| Official [`@remotion/*`](https://www.remotion.dev/docs) | Remotion license (free for individuals and companies up to 3 people; company license otherwise) | `npx remotion add <pkg>` | transitions (incl. shader ones), effects (60+), shapes, paths, noise, motion-blur, captions, media-utils, google-fonts, lottie, rive, three, gif, animated-emoji, sfx, layout-utils, install-whisper-cpp, openai-whisper, elevenlabs. |

How to adopt one: copy the component into `src/components/vendor/<lib>/`, keep its license header, and
wire it through the skill's `theme.ts` tokens and `fr()` frame scaling so it matches the rest of the
cut at 60 fps. Prefer copy-paste libraries (Onda, remocn, remotion-scenes) over npm packages when you
will restyle the component; prefer the npm package (remotion-bits) when you want updates.

## 2. Infographics and data animation

- This skill ships `BarChart`, `LineChart`, `DonutChart`, `Counter` and the `InfographicScene`
  (script `visual.type: "chart"` with `kind: bar | line | donut | stat`). Lines draw on with
  `evolvePath`, bars grow with staggered springs, donuts sweep, counters use tabular numerals.
- D3 works inside Remotion as long as it only computes: use `d3-scale`, `d3-shape` (`line`, `area`,
  `arc`, `pie`, `stack`), `d3-geo` for maps, and render the resulting path strings in SVG driven by
  `useCurrentFrame()`. Never use D3 transitions or timers. Install with `npm i d3-shape d3-scale` and
  `@types/d3-shape @types/d3-scale`. Remotion's resources page lists a D3 example.
- Racing bar charts: sort per frame, animate `top` with `interpolate` between rank positions over
  10 to 15 frames, keep 8 to 10 rows visible.
- Maps: the official `remotion-maps` skill (`npx remotion skills add`) covers Mapbox, MapLibre,
  MapTiler, GeoJSON routes and CesiumJS 3D flyovers.
- Data hygiene: round to what the voiceover says, animate to the final value the narrator lands on,
  and give every chart a one-line title that states the takeaway, not the axis.

## 3. Caption styles and typography

Research from 2026 creator guides (Submagic, Ascynd, Blitzcut, Vidpal, Zapcap) converges on:

| Style | Face | Treatment | Where it wins |
|---|---|---|---|
| Hormozi | Montserrat Black 900 (or Impact) | uppercase, white with thick black stroke and hard offset shadow, active word bright yellow `#FFD93D` | business, education, talking head |
| MrBeast | Komika Axis / Anton / Bebas Neue | huge, italic or condensed, thick outline plus offset drop shadow, bounce in | entertainment, challenges |
| Pill / boxed | Inter or Poppins 800 | solid rounded background follows the active word | ads, brand, busy footage |
| Karaoke | Inter 800 | whole line visible, spoken word changes color | calm explainers |
| Minimal | Inter 600 | lowercase, translucent bar, dimmed unspoken words | premium / editorial |
| TikTok native | [TikTok Sans](https://github.com/tiktok/TikTokSans) (OFL 1.1, on Google Fonts) | platform look | when matching in-app captions |

All of these are in `CaptionLayer` as `hormozi | pop | boxed | karaoke | outline | minimal`. Fonts
used here are Google Fonts (Inter, Montserrat, Anton) so licensing is clear; Komika Axis is
freeware but not on Google Fonts, load it with `@remotion/fonts` if a client insists.

Typography rules that hold across styles: 3 to 5 words per page vertical, 900 weight, stroke 3 to
5 px at 1080 wide, keep the block in the caption band (`getCaptionBand`), and never caption music.

## 4. Transitions and effects

- Built in: `@remotion/transitions` presentations `fade, slide, wipe, flip, clockWipe, iris, none`
  plus shader presentations `filmBurn, dreamyZoom, zoomBlur, dissolve, ripple, crosswarp,
  crossZoom, swap, bookFlip, linearBlur, zoomInOut, blurSlide` and the CSS `pushCut` with flash.
- This skill adds CSS-only `zoomPunch`, `whipPan`, `glitchSlam` and a pacing-aware `pickTransition()`
  so fast cuts alternate punch / push / whip / glitch and calm cuts stay on fades.
- Community: Onda's 18 (glassWipe, typeMask, devicePullback, gridPixelate), remocn's spatial push and
  frosted glass wipe, Ashad001's striped slam and vertical shutter.
- Effects: `@remotion/effects` (blur family, glow, light leak, chromatic aberration, pixelate,
  halftone, vignette, LUT, color correction, distortion) on canvas media; CSS filters and blend
  washes (`Graded`) on any HTML. Catalog in `remotion-api.md` section 9.
- GL-transitions style shaders: the official shader presentations already port the popular ones;
  custom GLSL can be added through `createEffect()` with `backend: 'webgl2'`.

## 5. Voiceover: ElevenLabs, voice choice, sync

- Endpoint used: `POST /v1/text-to-speech/{voice_id}/with-timestamps` (character alignment returned
  alongside the audio). The skill converts alignment to word `Caption[]` so captions and any
  word-triggered animation are frame-accurate without a transcription step. Models:
  `eleven_multilingual_v2` (default, stable), `eleven_v3` (most expressive, audio tags like
  `[excited]`, `[pause]`, `[whispers]`), `eleven_flash_v2_5` / `eleven_turbo_v2_5` (fast, cheap).
  `voice_settings.speed` 0.7 to 1.2 (1.08 to 1.12 for fast-paced content), `stability` 0.35 to
  0.5 for energy, `style` 0.3 to 0.5.
- Voice choice for "young male, professional, fast-paced adult": the `young-male-pro` preset
  filters your ElevenLabs library by labels (male, young or middle-aged, narration / social /
  conversational / confident) and falls back to the premade voice Liam; `young-male-hype` falls back
  to Will; `male-deep-narrator` to Brian. Run `generate-voiceover.mjs --list-voices` to see what
  your key can use and pin a `voiceId` in the script once you like one. Premade ids change over
  time; the listing is the source of truth.
- Automatic script analysis: `analyze-script.mjs` turns Claude's Markdown into scenes, headlines,
  highlight words, chart data and delivery hints, and sets pacing-specific voice settings.
- Frame sync: scene durations come from the actual audio (`manifest.json`), captions from the
  alignment, music ducking from the same segments. Nothing is hand-timed.

## 6. Logo and watermark placement

Guides for 2026 (Kreatli, Outfy, TryMyPost, Reels-editor) agree: top-left or top-right, below the
status/profile chrome (about 270 px on 1080x1920), never the bottom 20 percent (captions, title,
progress) and never the right rail (like / comment / share). On YouTube 16:9 avoid the bottom-right
(end screen, progress). Size 5 to 10 percent of width, same spot on every video. This is encoded
in `getLogoSlot()` and rendered by `LogoBadge` (image or text mark, pill background optional,
watermark opacity).

## 6b. SVG icons and real brand logos

- [Simple Icons](https://simpleicons.org) (npm `simple-icons`, CC0): 3 300+ monochrome brand marks with the official hex, source URL and guidelines link per icon; the pipeline's primary logo source.
- [SVG Logos](https://github.com/gilbarbara/logos) via Iconify `logos` (CC0): full-color brand logos.
- [Iconify](https://iconify.design) API and `@iconify-json/*` packages: 200 000+ icons across sets; used here for `logos`, `lucide` (ISC), `tabler` (MIT), `fluent-emoji-flat` (MIT).
- Remotion-side: `@remotion/paths` (`evolvePath` draw-on), `@remotion/shapes`; the template `Icon` component does draw-on with `pathLength`.
- Rejected: icon fonts (blurry at 4K, no per-path animation), raster logo scrapes (wrong colors, no license), Font Awesome brands (CC BY 4.0 needs attribution in the video and lacks brand hex).

## 6c. Publishing and scheduling APIs

- YouTube Data API v3: `videos.insert` (resumable, 1 600 units), `thumbnails.set`, `captions.insert`; scheduling via `status.privacyStatus=private` + `status.publishAt`. Quota 10 000 units per day by default.
- Instagram Graph API (v25): Reels via resumable container upload (`media?media_type=REELS&upload_type=resumable`, rupload endpoint, `media_publish`); 100 API posts per day; no scheduling, which is why autopilot has `publish-due`.
- Facebook Reels API: `video_reels` start / upload / finish with `video_state=SCHEDULED` (10 min to 29 days). Page videos: `/videos` with `scheduled_publish_time`.
- Alternatives when you outgrow scripts: Postiz (open source, self-hosted scheduler with API), Mixpost (self-hosted), Buffer / Metricool (hosted). They add TikTok, LinkedIn and X; the publish pack JSON maps onto their fields.

## 6d. Automation runners

- launchd on macOS (this skill's `install-autopilot.sh`), with `caffeinate` for lid-closed renders; cron on Linux.
- Claude Code headless: `claude -p "<prompt>" --allowedTools ...` writes scripts; `--output-format json` gives structured results. Known: occasional hang without a TTY under launchd (timeout + retry handles it).
- n8n / Node-RED for people who want a visual flow around the same scripts; the dashboard's `/api/tasks` endpoint accepts the same task names.

## 7. Neon, glow, 2.5D / 3D and camera

- `NeonText`: layered text-shadow glow, deterministic tube-ignition flicker, breathing pulse,
  optional extrusion; renders without WebGL. `glow()` from `@remotion/effects` adds true bloom on
  canvas media when WebGL is available.
- `Camera3D` + `Layer` + `Card3D`: CSS perspective rig with pan / tilt / roll / dolly keyframes and
  handheld noise; layers at different Z depths parallax correctly. Use for depth-stacked
  infographics, floating UI cards, product cards; for real meshes and lighting use
  `@remotion/three` (React Three Fiber, no `useFrame`).
- Community references: remotion-scenes neon and glitch text scenes, remotion-bits 3D scenes and
  camera presentations, the money-typography study in the Remotion showcase (parallax, glow and
  stroke reveals computed from frame numbers).

## 8. Color grading and LUTs

- `lut()` in `@remotion/effects` (4.0.526+) applies any 3D `.cube` (size 2 to 256) to canvas media.
  `make-lut.mjs` generates seven LUTs (teal-orange, warm-film, cool-noir, vibrant-pop,
  bleach-bypass, matte-fade, neon-night) that match the CSS grades in `grades.tsx`, so HTML scenes
  (`<Graded>`) and footage (`<LutVideo>`) share one look.
- Free LUT sources: [darkyboys/opensource-luts](https://github.com/darkyboys/opensource-luts)
  (CC0, .cube), [ray-cast/lut](https://github.com/ray-cast/lut), and generators
  [lutgen-rs](https://www.shutternoise.com/articles/free-lut-generator-lutgen-rs-open-source.html)
  and [lut-maker](https://github.com/o-l-l-i/lut-maker) for building a LUT from a reference frame.
  Check each repository's license before client work; camera-manufacturer LUTs are usually free to
  use but not to redistribute.
- Grading order: normalize footage (white balance, exposure, levels) then apply the look, then the
  vignette; keep skin tones inside the teal-orange push by lowering `strength`.

## 9. Background music: ElevenLabs Music and free libraries

- ElevenLabs Music API: `POST /v1/music` with `prompt`, `music_length_ms` (3 s to 10 min),
  `force_instrumental: true`, `model_id` (`music_v1`, `music_v2`, `music_v2_5`), output MP3.
  `generate-music.mjs` composes a bed of exactly the video length with mood presets tuned to sit
  under narration. Composition plans allow section-level control; no artist or copyrighted lyric
  references are allowed in prompts.
- Free libraries (verify license per track): Pixabay Music (Pixabay Content License, no attribution,
  no resale), Mixkit (Mixkit License, no attribution), Free Music Archive (per-track CC; filter CC0 /
  CC BY), Chosic's CC0 list, YouTube Audio Library (YouTube uploads; filter "attribution not
  required"), Uppbeat free tier (attribution required unless paid). "Royalty-free" does not mean
  "no attribution"; keep a `public/music/LICENSES.md` with track, source and license.
- Local generation, optional: Meta MusicGen (audiocraft) runs on Apple Silicon for short loops; heavy
  and slow compared with the API. Not required by this pipeline.

## 10. Fast-paced presentation style

Encoded as `pacing: "fast"`: 0.35 s air after each line, 2-frame word stagger, 8-frame transitions
alternating zoom punch / push cut / whip pan / glitch, an accent flash plus 2 percent scale bump at
every cut, camera push to 1.08 per scene, 185 wpm voice at speed 1.08, Hormozi captions with 3 to
4 words per page, and a hook scene of at least 2 s. Long-form uses `medium`; luxury and calm
explainers use `calm`. Beyond the tokens, the craft rules in `motion-design.md` still apply: one idea
per scene, motivated cuts, and an exit before every entrance.

## 11. Render servers and dashboards

- This skill's `tools/dashboard` (see `dashboard.md`) runs locally, renders in-process with the
  Node API for real progress and cancel, applies the machine budget, runs the scripts and previews
  outputs.
- Alternatives when you need more: Remotion Studio's own render queue (Render button, progress,
  cancel), [template-render-server](https://github.com/remotion-dev/template-render-server)
  (Express, start / progress / cancel endpoints), [AIEV](https://github.com/notivn/AIEV)
  (self-hosted web UI driving Remotion and GSAP), [Creativ-Studio/remotion-render-server](https://github.com/Creativ-Studio/remotion-render-server)
  (REST queue with ETA), and Remotion Lambda for scale.

## 12. Policy: no AI video generation

Everything is deterministic code: React components, SVG, Canvas, WebGL effects, typography, data,
audio APIs for voice and music, and footage or images the user supplies. The skill does not call
text-to-video or image-to-video models. If a brief needs a shot that cannot be built in code, the
answer is stock or shot footage, a 3D scene in `@remotion/three`, or a designed still, not a
generated clip.
