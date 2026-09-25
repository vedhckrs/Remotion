# Remotion Video Producer skill

An agent skill for building high-end programmatic video with [Remotion](https://www.remotion.dev): YouTube long-form and Shorts, Instagram Reels / Feed / Stories, Facebook Reels / Feed. It gives Claude Code (or any agent that reads `SKILL.md` files) a full production pipeline: brief to script, AI voiceover, motion design, word-level captions, music ducking, platform safe zones, multi-format rendering and a QA pass.

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
│   ├── rendering.md         CLI flags, presets, stills, GIF, alpha, Lambda and cloud
│   └── troubleshooting.md   flicker, fonts, WebGL, media, timeouts
├── scripts/                 Node 20+ scripts, no build step
│   ├── scaffold.sh          new project + packages + templates + config
│   ├── generate-voiceover.mjs   ElevenLabs (with word timestamps) or OpenAI TTS per scene
│   ├── audio-durations.mjs  manifest for voiceover you already have
│   ├── transcribe-whisper.mjs   local Whisper.cpp to captions
│   ├── transcribe-cloud.mjs OpenAI Whisper API or ElevenLabs Scribe to captions
│   ├── render-preset.sh     platform render presets
│   └── lib/                 alignment, env, media, script schema helpers
├── assets/templates/        starter components that compile against Remotion 4.0.529
│   ├── remotion.config.ts
│   ├── public/script/example.json
│   └── src/ (lib/platforms, lib/motion, lib/theme, lib/script, components/*, scenes/*, compositions/SocialVideo, Root.example)
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

The agent scaffolds a project (`scripts/scaffold.sh`), writes `public/script/<id>.json`, generates voiceover (`ELEVENLABS_API_KEY` or `OPENAI_API_KEY` in `.env`), builds scenes from the templates, adds captions and music, checks safe zones, and renders with `scripts/render-preset.sh`.

## Requirements

Node 20+, npm (or pnpm / bun / yarn), Chrome is downloaded by Remotion on first render. FFmpeg and FFprobe ship with Remotion. A TTS key for voiceover; none for local Whisper captions.
