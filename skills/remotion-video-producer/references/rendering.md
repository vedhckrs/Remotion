# Rendering and delivery

Table of contents
1. Presets
2. CLI flags that matter
3. Quality settings explained
4. Stills, frame ranges, GIFs, transparent video
5. Programmatic rendering (Node API)
6. Cloud rendering: Lambda, Cloud Run, containers
7. Performance
8. Delivery checklist

## 1. Presets

`scripts/render-preset.sh <composition-id> <preset> [--4k] [--hw] [--budget 50] [--background] [extra flags]` wraps `npx remotion render`. `--budget` (default 50 percent) sets `--concurrency` = cores x budget capped by memory / 4 and runs the render under `nice -n 10`; `--4k` captures at scale 2 (the default master: 2160x3840 vertical, 3840x2160 horizontal at the composition's 60 fps) and halves concurrency; `--hw` replaces CRF with `--hardware-acceleration=if-possible --video-bitrate` (VideoToolbox on macOS, NVENC on NVIDIA); `--background` (macOS) adds `taskpolicy -b`. The dashboard queues the same presets through the Node API with live progress:

| Preset | Flags | Output |
|---|---|---|
| `youtube-1080p` | `--codec=h264 --crf=16 --x264-preset=slow --color-space=bt709 --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k`; `--hw`: 16 Mbps | `out/<id>_youtube_1920x1080.mp4` |
| `youtube-4k` | as above plus `--scale=2`, `--crf=17`, half concurrency; `--hw`: 60 Mbps | `out/<id>_youtube_3840x2160.mp4` |
| `shorts` / `reels` / `stories` / `facebook` | `--codec=h264 --crf=17 --x264-preset=medium ... --audio-bitrate=256k`; `--hw`: 14 Mbps | `out/<id>_<platform>_1080x1920.mp4` |
| `feed` | same at 1080x1350; `--hw`: 12 Mbps | `out/<id>_feed_1080x1350.mp4` |
| `preview` | `--crf=28 --scale=0.5 --x264-preset=ultrafast --jpeg-quality=70` | quick check |
| `prores` | `--codec=prores --prores-profile=4444 --image-format=png --pixel-format=yuva444p10le` | editor handoff / alpha |

The scripts leave the GL backend to `remotion.config.ts`; export `REMOTION_GL=swangle` on machines without a GPU (the config and the preset script both honor it).

Set `--props` to switch platform variants of the same composition when you designed it that way (`--props='{"platform":"reels"}'`). Composition ids per platform are the simpler route.

## 2. CLI flags that matter

```
npx remotion render <id> <out> \
  --codec=h264|h265|vp8|vp9|av1|prores|gif|mp3|aac|wav \
  --crf=<n>                     # quality (h264 default 18; lower is better; 1 to 51)
  --video-bitrate=8M            # alternative to crf (do not combine)
  --encoding-max-rate / --encoding-buffer-size
  --audio-codec=aac|mp3|opus|pcm-16 --audio-bitrate=320k
  --pixel-format=yuv420p|yuv422p|yuv444p|yuva420p|yuv420p10le|yuva444p10le
  --color-space=bt709|bt2020-ncl|default
  --image-format=jpeg|png --jpeg-quality=<0-100>   # frame capture format (png for exact color / alpha)
  --scale=<0.1..16>            # multiply composition size at capture time
  --frames=0-90 | --frames=10,20,30
  --every-nth-frame=2          # gif
  --number-of-gif-loops=0
  --muted | --enforce-audio-track | --separate-audio-to=out/audio.wav
  --props='{"key":"value"}' | --props=./props.json
  --concurrency=<n|50%>        # tabs; default half the cores
  --gl=angle|angle-egl|swangle|swiftshader|egl|vulkan   # WebGL backend: angle (desktop GPU), angle-egl (Linux GPU), swangle (no GPU, Docker, Lambda default)
  --x264-preset=ultrafast..veryslow
  --hardware-acceleration=if-possible   # VideoToolbox/NVENC; disables crf
  --disallow-parallel-encoding
  --timeout=<ms>               # delayRender timeout, default 30000
  --log=verbose
  --overwrite
```

## 3. Quality settings explained

- H.264 CRF 16 to 18 at `x264-preset=slow` is visually lossless for upload masters and stays well above platform floors (YouTube 1080p: 8 Mbps SDR, 12 Mbps at 60 fps; 4K: 35 to 45 Mbps). Platforms re-encode; feeding them CRF 16 avoids double-compression mush.
- `--color-space=bt709` keeps Studio colors and the MP4 identical; without it Remotion tags BT.601 and reds shift. Pair with `--image-format=png` when exact color matters (slower).
- `yuv420p` is required for compatibility everywhere; only use 4:2:2 / 4:4:4 or 10-bit for ProRes handoffs.
- `--scale=2` on a 1080p composition gives a true 4K capture (text stays crisp) at roughly 3 to 4 times render time.
- Hardware encoding (`--hardware-acceleration=if-possible`): VideoToolbox on macOS, NVENC on Linux/Windows with NVIDIA, for H.264, H.265 and ProRes. CRF cannot be combined with it, so set `--video-bitrate` (8 Mbps matches software file sizes at 1080p; the presets use 14 to 16 Mbps for headroom, 60 Mbps for 4K). Files are larger and compression slightly less efficient, but encoding stops being the bottleneck and the CPU stays cool on a laptop. Not available on Lambda or Cloud Run. Verify with `--log=verbose` ("hardware accelerated: true").
- Concurrency: memory bound. Chrome tabs each hold a frame plus media; on 16 GB use 4 for 1080p and 2 for 4K or heavy WebGL. The config template computes `min(cores / 2, memoryGB / 4)`.
- Audio: AAC-LC 48 kHz, 256 to 320 kbps stereo.
- HDR: Remotion renders SDR from the browser; deliver SDR. For an HDR mezzanine use ProRes and grade externally.
- H.265 / AV1: smaller files, slower encodes, some upload pipelines reject them. Deliver H.264 unless asked.

## 4. Stills, frame ranges, GIFs, transparent video

```bash
npx remotion still Thumbnail out/thumb.png --scale=2           # 2x still
npx remotion still Reel out/f0.png --frame=0                    # any frame of a video composition
npx remotion render Reel out/frames --frames=0,45,120 --image-format=png   # a handful of frames for review
npx remotion render Reel out/preview.gif --codec=gif --every-nth-frame=2 --scale=0.4 --number-of-gif-loops=0
npx remotion render Sticker out/sticker.webm --codec=vp9 --pixel-format=yuva420p --image-format=png   # alpha WebM
npx remotion render Sticker out/sticker.mov --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png  # alpha ProRes
```
Stills use the same `calculateMetadata` and props. `<Still>` compositions have no fps or duration.

## 5. Programmatic rendering (Node API)

```ts
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

const serveUrl = await bundle({entryPoint: 'src/index.ts', publicDir: 'public'});
const composition = await selectComposition({serveUrl, id: 'Reel', inputProps});
await renderMedia({composition, serveUrl, codec: 'h264', crf: 17, colorSpace: 'bt709', outputLocation: 'out/reel.mp4', inputProps, chromiumOptions: {gl: process.env.GPU ? 'angle' : 'swangle'}, onProgress: ({progress}) => ...});
```
Use this for batch runs (many videos from a data source) or a render server (see the `template-render-server` repo).

## 6. Cloud rendering

Remotion Lambda (AWS) is the fastest option for many or long videos: it splits the render across hundreds of Lambdas and stitches on S3.

```bash
npx remotion add @remotion/lambda
npx remotion lambda policies role | user      # IAM policies to paste in AWS
# REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY in .env
npx remotion lambda policies validate
npx remotion lambda functions deploy --memory=3009 --disk=10240 --timeout=240
npx remotion lambda sites create --site-name=<project>
npx remotion lambda render <site-url-or-name> <composition-id> --codec=h264 --crf=17 --color-space=bt709 --privacy=public --out-name=<id>.mp4
npx remotion lambda quotas
```
Limits: about 80 min of 1080p per render, 5 GB output, no AV1, 1000 concurrent lambdas per region by default. Redeploy the function after upgrading Remotion and the site after changing code. Costs are per-render only.

Alternatives: Cloud Run (GCP, `@remotion/cloudrun`, longer renders), Vercel sandbox, GitHub Actions (`ssr.md#render-using-github-actions`), Azure Container Apps, Cloudflare Containers, or any Docker host with the Node API. Client-side rendering (`@remotion/webcodecs` / Mediabunny) works in the browser for short, simple compositions without `<OffthreadVideo>`.

## 7. Performance

- Concurrency: Remotion's default is half the CPU cores, which overcommits memory on a 16 GB laptop; the config template caps it by memory. Raise toward `--concurrency=100%` only on a render box with 4 GB or more per core, lower when the machine swaps.
- Video-heavy compositions: `<Video>` from `@remotion/media` decodes with Mediabunny (fast); avoid many simultaneous 4K sources; downscale sources to the canvas size.
- WebGL effects and `HtmlInCanvas` cost 2 to 5 times; motion blur multiplies by `samples`.
- Fonts: load once at module level; do not load in every scene.
- Cache: `bundle()` once for many renders; the CLI caches the webpack bundle in `node_modules/.cache`.
- `--jpeg-quality=80` (default) is fine; PNG capture only when color exactness or alpha is required.
- Big fetches in `calculateMetadata` run once per render, not per frame; keep per-frame components pure.

## 8. Delivery checklist

- File named `<video-id>_<platform>_<WxH>.mp4`, plus `.srt` if captions exist, plus thumbnail PNG.
- First and last frames checked (no black frames, no unresolved fonts).
- Audio peak below -1 dBTP, integrated around -14 LUFS.
- Duration within the platform limit; frame size exactly the platform canvas.
- The `remotion.config.ts` used for the render is committed; renders are reproducible from `git` + `public/`.
