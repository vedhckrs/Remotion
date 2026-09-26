# Remotion Video Producer skill

An agent skill for building high-end programmatic video with [Remotion](https://www.remotion.dev): YouTube long-form and Shorts, Instagram Reels / Feed / Stories, Facebook Reels / Feed, delivered as 4K 60 fps masters from one project. It gives Claude Code (or any agent that reads `SKILL.md` files) a full production pipeline: Markdown script to scene JSON, ElevenLabs voiceover with frame-accurate word sync, viral caption styles, kinetic typography, a 3D camera rig and neon looks, ten animated background systems, style presets for channel consistency, animated infographics, real brand logos and SVG icons with an on-screen credit line, color grades and LUTs, logo safe slots, music beds with ducking, thumbnails, per-platform SEO upload packs, scheduled publishing to YouTube / Instagram / Facebook, a daily autopilot (2 Shorts + 1 long video) and a local dashboard that renders on a 50 percent machine budget so you keep working. Everything is code: no AI video generation.

```
skills/remotion-video-producer/
├── SKILL.md                 workflow, rules, file index (read first)
├── references/              deep guidance, loaded on demand
│   ├── remotion-api.md      API cheat sheet for Remotion 4.0.5xx and determinism rules
│   ├── platform-specs.md    canvases, safe zones, durations, bitrates per platform
│   ├── motion-design.md     easing vocabulary, kinetic type, camera, transitions, effects, 3D
│   ├── visual-design.md     typography, color, backgrounds, footage and AI-asset treatment
│   ├── audio-voiceover.md   TTS providers, voice direction, music ducking, SFX, loudness
│   ├── captions.md          transcription sources, TikTok-style pages, styling, SRT export
│   ├── rendering.md         CLI flags, presets, 4K60, stills, GIF, alpha, Lambda and cloud
│   ├── local-machine.md     Apple Silicon laptop profile: 50% budget, GL, thermals, storage, local Whisper/TTS
│   ├── dashboard.md         the local control room and its API
│   ├── ecosystem.md         researched plugins and sources: libraries, captions, transitions, voices, LUTs, music, icons, publishing APIs
│   ├── icons-and-logos.md   brand marks and icon sets, the icon scene, trademark rules, the credit line
│   ├── publishing-seo.md    thumbnails, per-platform copy rules, scheduling, API credentials and quotas
│   ├── automation.md        the daily autopilot: queue, Claude Code writer, launchd, consistency, scaling
│   └── troubleshooting.md   flicker, fonts, WebGL, media, timeouts
├── scripts/                 Node 20+ scripts, no build step
│   ├── scaffold.sh          new project + packages + templates + config
│   ├── analyze-script.mjs   Markdown script to scene JSON (headlines, highlights, charts, icons, seo); --check validates JSON
│   ├── generate-voiceover.mjs   ElevenLabs (word timestamps, voice presets) / OpenAI / macOS say per scene
│   ├── generate-music.mjs   ElevenLabs Music bed of exact length, or free-library guidance
│   ├── make-lut.mjs         seven .cube LUTs matching the CSS grades
│   ├── audio-durations.mjs  manifest for voiceover you already have
│   ├── transcribe-whisper.mjs   local Whisper.cpp to captions
│   ├── transcribe-cloud.mjs OpenAI Whisper API or ElevenLabs Scribe to captions
│   ├── fetch-icons.mjs      real brand logos (Simple Icons, SVG Logos) and icon sets (Lucide, Tabler, Fluent emoji) with credits.json
│   ├── make-thumbnails.mjs  thumbnail 1280x720, cover 1080x1920, square; JPEG under 2 MB; A/B variants
│   ├── make-publish-pack.mjs  per-platform titles, descriptions, tags, hashtags, chapters, credits
│   ├── publish.mjs          scheduled uploads: YouTube (publishAt), Instagram Reels, Facebook Reels / video
│   ├── auth-youtube.mjs     one-time YouTube OAuth for the refresh token
│   ├── autopilot.mjs        plan / run / publish-due queue: 2 Shorts + 1 long a day, Claude Code headless writer
│   ├── install-autopilot.sh launchd agents (nightly produce under caffeinate, publish-due every 30 min)
│   ├── render-preset.sh     platform presets: --4k masters, --hw encoding, --budget, nice
│   ├── machine-check.sh     machine profile, recommended settings, GL render test
│   └── lib/                 alignment, env, media, script schema helpers
├── assets/dashboard/        local control room (server.mjs + index.html), installed to tools/dashboard
├── assets/automation/       queue.example.json, topics.example.md, writer-prompt.md, installed to automation/
├── assets/templates/        starter components that compile and render against Remotion 4.0.529 at 60 fps
│   ├── remotion.config.ts
│   ├── public/script/example.json
│   └── src/ (lib: platforms, motion, theme, styles, script, grades, transitions; components incl. NeonText, Camera3D, Background, Icon/BrandLogo/AttributionBar, charts, CaptionLayer, LogoBadge, LutMedia; scenes: VoiceoverScene, InfographicScene, IconScene; compositions/SocialVideo, Thumbnail; Root.example)
└── evals/evals.json         test prompts for the skill-creator loop
```

## Install

Claude Code, per project:

```bash
mkdir -p .claude/skills
cp -R skills/remotion-video-producer .claude/skills/
```

Claude Code, for every project: copy the folder to `~/.claude/skills/remotion-video-producer`.

Claude.ai / Cowork: zip the folder (or run `python -m scripts.package_skill skills/remotion-video-producer` from the skill-creator skill) and upload the `.skill` file in Settings.

The official Remotion skills (`npx remotion skills add` inside a project) complement this one; this skill focuses on the production pipeline and platform delivery, and defers to the official docs for API details it does not cover.

## Use

Say `start Remotion` or simply describe the video:

- "Make a 30-second YouTube Short from this script with an ElevenLabs voice, pop captions and a purple accent."
- "Turn this 6-minute explainer outline into a 16:9 YouTube video with chapter cards and a lower third for the host."
- "Render this composition for Reels, Shorts and Facebook Feed with safe zones respected."

- "Plan tomorrow's two Shorts and one long video, produce them tonight and schedule the uploads."

The agent scaffolds a project (`scripts/scaffold.sh`), writes the script as Markdown and converts it with `npm run analyze`, fetches the real logos it names (`npm run icons`), generates voiceover (`ELEVENLABS_API_KEY` in `.env`, or the free macOS voice for drafts), builds scenes from the templates under a style preset, adds captions and music, checks safe zones, renders 4K60 masters with `npm run render -- <Composition> <preset> --4k` or from the dashboard at `npm run dashboard` (http://localhost:4545), makes thumbnails (`npm run thumbs`), writes per-platform upload copy (`npm run pack`) and schedules uploads (`npm run publish`). `npm run autopilot` runs the whole chain daily; `npm run autopilot:install` puts it on launchd.

## Tuned for

A MacBook Air M5 (10 CPU cores, 8 GPU cores, 16 GB, 512 GB) that keeps doing other work while it renders: a 50 percent machine budget by default (4 tabs at 1080p, 2 at 4K, `nice -n 10`), ANGLE on Metal for WebGL, software x264 for short finals and VideoToolbox (`--hw`) for long-form, a shared Whisper cache, and a free macOS voice for timing drafts. `npm run machine-check` confirms the profile on any machine; Linux and CI fall back to `swangle` automatically.

## Requirements

Node 20+, npm (or pnpm / bun / yarn). Chrome is downloaded by Remotion on first render. FFmpeg and FFprobe ship with Remotion. A TTS key for the final voiceover (none for macOS `say` drafts); nothing for local Whisper captions; `cmake` only for `large-v3-turbo`. For publishing: a Google Cloud OAuth client (YouTube Data API v3) and a Meta app with an Instagram professional account and a Facebook Page; setup in `references/publishing-seo.md`. Claude Code on the PATH for the headless script writer (optional; `writer: "manual"` otherwise).
