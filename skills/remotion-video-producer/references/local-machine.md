# Local machine profile: Apple Silicon laptop

Reference profile: MacBook Air with an M5 chip, 10 CPU cores, 8 GPU cores, 16 GB unified memory, 512 GB SSD, no fan. Everything here scales to other Macs; the numbers are the ones that matter on this one. Run `scripts/machine-check.sh --render-test <composition>` once per project to confirm them on the actual hardware.

Table of contents
1. What this machine is good and bad at
2. Settings that the skill applies automatically
3. Rendering: software vs hardware encoding, 4K, time estimates
4. Memory hygiene during renders
5. Thermals on a fanless laptop
6. Storage budget on 512 GB
7. Whisper, TTS and other local tools
8. Studio and preview
9. When to leave the laptop and render in the cloud

## 1. What this machine is good and bad at

Good: single-frame speed (Chrome on the M5 renders 1080p frames fast), Metal-backed WebGL through ANGLE, VideoToolbox hardware encoding for H.264, H.265 and ProRes, Whisper on Metal, silent operation, all-day battery for editing in Studio.

Limits: 16 GB is shared by Chrome tabs, the encoder, Studio, your browser and the OS, so parallelism is capped by memory rather than cores; no fan, so sustained full-CPU renders throttle after roughly 10 minutes; 512 GB fills quickly with node_modules, headless Chrome copies, Whisper models and 4K masters.

## 2. Settings the skill applies automatically

`remotion.config.ts` (template) reads the machine at startup:

| Setting | Value on this machine | Why |
|---|---|---|
| GL backend | `angle` (ANGLE on Metal) | Effects, light leaks, shader transitions and HtmlInCanvas all work on the GPU; no `swangle` needed on a Mac |
| Concurrency | `min(10 / 2, 16 / 4)` = 4 tabs | 4 Chrome tabs at 1080p use about 4 to 6 GB; 5 or more start swapping and get slower |
| 4K or WebGL-heavy | 2 tabs (`render-preset.sh youtube-4k` halves it) | Each 4K tab holds four times the pixels |
| Encoder | software x264, CRF 17, preset `medium` | Best quality per megabyte; `--hw` switches to VideoToolbox |
| Color | BT.709 | Matches Studio |

Overrides: `REMOTION_CONCURRENCY=n`, `REMOTION_GL=...`, `REMOTION_HW=1`, or the matching CLI flags.

## 3. Rendering: software vs hardware encoding, 4K, estimates

- Short finals (under about 90 s): software x264 with the preset's CRF. The 10-core CPU handles `slow` for YouTube and `medium` for vertical in a few minutes, and the files are the smallest for the quality.
- Long-form (3 min and up) or anything you will re-render several times: `scripts/render-preset.sh <id> youtube-1080p --hw`. VideoToolbox encodes at 16 Mbps for 1080p and 60 Mbps for 4K, runs cool, and frees the CPU for Chrome. Files are bigger; YouTube re-encodes anyway.
- 4K: rendered by capturing at `--scale=2` from the 1080p composition, so text stays sharp. Expect roughly 3 to 4 times the 1080p time and use concurrency 2. Only do it for YouTube long-form where the higher bitrate ladder matters.
- Rough wall-clock guide at 1080p, 30 fps, moderate scenes: about 3 to 6 s of video per minute of render for software x264 at concurrency 4; WebGL effects and motion blur samples slow this down proportionally; hardware encoding removes most of the encode share. Measure once with `--frames=0-300` and extrapolate before committing to an overnight render.
- Frame ranges for checks: `--frames=0-90` renders the hook only; `npx remotion still` for single frames.

## 4. Memory hygiene during renders

- Quit Remotion Studio and close heavy browser tabs before a final render; Studio alone holds a Chrome instance.
- If Activity Monitor shows memory pressure in yellow or red: `REMOTION_CONCURRENCY=3`, add `--disallow-parallel-encoding` (encodes after capture instead of alongside it), and avoid `--image-format=png` unless alpha is needed.
- Downscale source media to the canvas size before importing; a 4K phone clip decoded in four tabs is the fastest way to swap.
- `Config.setDelayRenderTimeoutInMilliseconds(60000)` is already set so a slow first frame under memory pressure does not fail the render.

## 5. Thermals on a fanless laptop

- Plug in, lid open, hard flat surface. On battery macOS lowers sustained performance.
- For renders over about 3 minutes of runtime, prefer `--hw` or keep `--x264-preset=medium`; `slow`/`slower` on long videos is where throttling shows.
- Batch overnight: chain presets in one shell line (`... shorts && ... reels && ... youtube-1080p --hw`), and let the machine sleep only after (`caffeinate -i` in front of the command keeps it awake).
- Do not run Whisper transcription and a render at the same time.

## 6. Storage budget on 512 GB

| Item | Typical size | Where | Keep or clear |
|---|---|---|---|
| `node_modules` per Remotion project | 500 to 800 MB | project | clear projects you are done with |
| Headless Chrome shell | about 150 MB per project | `node_modules/.remotion` | reinstalls automatically |
| Bundler cache | 100 to 500 MB | `node_modules/.cache` | safe to delete any time |
| Whisper.cpp + `medium.en` | about 1.6 GB | `~/.cache/remotion-whisper` (shared by all projects) | keep one or two models |
| 30 s vertical master, CRF 17 | 40 to 90 MB | `out/` | archive after upload |
| 8 min 1080p master, CRF 16 | 1 to 2 GB; with `--hw` 16 Mbps about 1 GB | `out/` | archive |
| 8 min 4K master | 4 to 8 GB | `out/` | render only when needed, archive immediately |
| Source footage and AI clips | varies, often the biggest | `public/media` | keep proxies in the project, originals on an external SSD |

Housekeeping commands: `rm -rf out/*.mp4 node_modules/.cache`, `du -sh ~/.cache/remotion-whisper`, `npx remotion versions` to spot duplicate installs. Keep at least 30 GB free; macOS and Chrome both misbehave below that.

## 7. Whisper, TTS and other local tools

- Whisper.cpp builds with Metal on Apple Silicon and `medium.en` transcribes faster than real time; `large-v3-turbo` is also practical but needs whisper.cpp 1.7.x, which needs `cmake` (`brew install cmake`). `scripts/transcribe-whisper.mjs` keeps binaries and models in the shared cache so each project stays small.
- Free voice for timing drafts: `scripts/generate-voiceover.mjs --provider macos` uses the system `say` command (no key, offline, instant). Download an Enhanced or Premium voice once in System Settings > Accessibility > Spoken Content > System Voice for a more natural read (Ava, Zoe, Evan, Samantha Enhanced). Lock the script and pacing with it, then regenerate the final with ElevenLabs so the word alignment comes back.
- Local neural TTS, optional: Kokoro through `mlx-audio` or Piper run comfortably on the M5; output WAV files named by scene id and run `scripts/audio-durations.mjs`.
- FFmpeg and FFprobe ship with Remotion as arm64 binaries; nothing to install. Use `npx remotion ffmpeg -i in.mov -c:v libx264 -crf 16 -pix_fmt yuv420p -movflags +faststart out.mp4` to normalize HEVC phone footage and ProRes before import, or `-c:v h264_videotoolbox -b:v 20M` for a fast hardware transcode.

## 8. Studio and preview

- Use Google Chrome for Studio (Safari is not supported for the editor). Chrome 149 or newer with `chrome://flags/#canvas-draw-element` enabled previews `HtmlInCanvas` and `HtmlInCanvasMotionBlur`; renders work without the flag.
- Studio previews WebGL effects on the GPU at full speed; if scrubbing stutters, lower the preview scale in the Studio toolbar rather than changing the composition.
- Keep Studio and a render from running at the same time on 16 GB when the render uses 4 tabs.

## 9. When to leave the laptop and render in the cloud

Move to Remotion Lambda when a single render would exceed about 30 minutes locally, when you need many variants (per-language, per-product batches), or when 4K long-form is a regular deliverable. Setup is in `rendering.md`; Lambda uses `swangle` by itself and is not affected by the laptop's memory or thermals. The local machine stays the design and preview tool.
