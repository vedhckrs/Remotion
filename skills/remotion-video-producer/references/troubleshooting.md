# Troubleshooting

Symptoms, causes and fixes, in the order they usually hit a production.

## Flicker, jitter, elements jumping between frames
- A value depends on something other than the frame: `Math.random()`, `Date.now()`, `useState` initialized differently per tab, CSS `transition/animation`, Tailwind `animate-*`, `useFrame()` in React Three Fiber, `setInterval`. Replace with `useCurrentFrame()` math and `random(seed)`.
- An asset loaded late in one tab: wrap fetches in `delayRender()` / `useDelayRender()`; use `<Img>`, `<Video>`, `<Audio>`, `<AnimatedImage>` instead of CSS `background-image` or raw `<img>`.
- Emergency diagnosis: `--concurrency=1` removes tab-state differences; if the flicker disappears, the cause is non-determinism.

## Google Fonts fail to load during `compositions` or render (`net::ERR_CERT_AUTHORITY_INVALID`, `Failed to fetch`)
- Headless Chrome does not trust a corporate or sandbox proxy certificate, so `@remotion/google-fonts` cannot download the font. Pass `--ignore-certificate-errors` to `npx remotion compositions|render|still` in that environment, or self-host the font with `@remotion/fonts` from `public/fonts/` (also the right choice for reproducible renders on Lambda and in CI).

## Fonts render as fallback in the video but fine in Studio
- `loadFont()` not called at module scope, or wrong weight requested. Load the exact weights and subsets, call at the top of the file, and check `waitUntilDone()` before measuring text.
- Local fonts: file must be in `public/` and referenced with `staticFile()`; `format` inferred from the extension.

## Effects, light leaks or `HtmlInCanvas` are missing or black in the render
- WebGL disabled or the wrong backend for the machine. `--gl=angle` (or `Config.setChromiumOpenGlRenderer('angle')`) on a desktop with a GPU; `--gl=angle-egl` on Linux with a GPU; `--gl=swangle` on anything without a GPU (Docker, CI, cloud VMs; it is software rendering and slower). Lambda and Cloud Run default to `swangle`. If `angle` throws "Failed to acquire WebGL2 context", switch to `swangle` before anything else. `swiftshader`, `egl` and `vulkan` exist but rarely help where `swangle` does not.
- Confirm the backend actually works with one still: `npx remotion still <id> out/gl.png --frame=10 --gl=swangle`.
- Templates degrade without WebGL: `Background` grain and `LightLeakOverlay` are opt-in via `webgl` props / the `webglExtras` composition prop, so a render never depends on GL unless you turned those on.
- Nested `<HtmlInCanvas>` is unsupported; flatten.
- Preview of `HtmlInCanvas` and `HtmlInCanvasMotionBlur` needs Chrome 149+ with `chrome://flags/#canvas-draw-element`; rendering does not.

## Video shows the wrong frames, freezes, or is black
- Source codec not decodable (HEVC 10-bit, ProRes without the flag, AV1 on old Chrome): transcode to H.264 with `npx remotion ffmpeg -i in.mov -c:v libx264 -crf 16 -pix_fmt yuv420p out.mp4`.
- `trimBefore` / `trimAfter` given in seconds instead of frames: multiply by `fps`.
- `<Video>` from `@remotion/media` falls back to `<OffthreadVideo>` on unsupported input; pass `disallowFallbackToOffthreadVideo` to fail loudly while debugging.
- Reverse playback is unsupported; render a reversed file with FFmpeg first.

## Audio missing, out of sync, or clipped
- Remotion muxes audio from `<Audio>` / `<Video>` only; the render must not be `--muted`.
- Voice starts mid-word: the scene is shorter than the audio, or the transition overlaps the start. Recompute frames from the manifest and add the gap.
- Delay by `from`, not by `trimBefore` (which skips audio content).
- Volume callbacks receive the media's own frame (starting at 0), not the composition frame.
- Sync drift on long videos: source audio with variable sample rate; re-encode to 48 kHz AAC/WAV.

## `delayRender()` timeout
- A fetch or font never resolved. Increase `--timeout=60000` only after checking the URL/CORS; call `cancelRender(err)` in the catch so the error surfaces instead of the timeout.
- Remote media without CORS headers fails in Chrome: move it to `public/` or a CORS-enabled bucket.

## Console shows `voiceover/<id>/manifest.json 404` before voiceover exists
- Expected. `calculateMetadata` in the `SocialVideo` template falls back to reading-time estimates until `scripts/generate-voiceover.mjs` or `audio-durations.mjs` writes the manifest; the noise disappears after that. A missing `public/script/<id>.json`, by contrast, is a hard error on purpose.

## Composition duration is wrong
- `calculateMetadata` returned before the manifest updated: rerun the voiceover script, then restart Studio (metadata is recomputed on prop changes and reload).
- Transitions subtract frames: total = sum(scenes) - sum(transitions).
- `springTiming` without `durationInFrames` depends on fps; use `getDurationInFrames({fps})` when summing.

## Colors differ between Studio and the MP4
- Render with `--color-space=bt709`; optionally `--image-format=png`. Dark gradients band in `yuv420p`: add grain or lift blacks slightly.

## Text overflows on another platform size
- Positions hardcoded for one canvas. Derive from `useVideoConfig()` and `platforms.ts`, use `fitText`, and test every registered composition with `npx remotion still <id> out/check.png`.

## Studio cannot select or keyframe an element
- Non-inline style, spread, computed constants, or `transform` string. Follow the interactivity rules in `remotion-api.md` section 7 for that element.

## Version mismatch errors (`remotion` vs `@remotion/*`)
- `npx remotion versions` shows the mismatch; fix with `npx remotion upgrade` or align all packages to one exact version. Always add packages with `npx remotion add`.

## Slow renders
- Reduce `samples` on motion blur, avoid full-frame `HtmlInCanvas` when CSS suffices, downscale source media, render at `--scale=0.5` for previews, increase `--concurrency` only on machines with RAM to spare, and use Lambda for anything over a few minutes of 1080p.
- On a 16 GB laptop the render gets slower when concurrency goes above 4, not faster: Chrome tabs start swapping. Check Activity Monitor memory pressure; drop to 3, add `--disallow-parallel-encoding`, quit Studio.
- Fanless MacBook Air: a render that starts fast and slows after 10 minutes is thermal throttling. Plug in, use `--hw` (VideoToolbox) or `--x264-preset=medium`, and prefer several shorter renders over one long one.

## `--hw` / hardware acceleration produced a large file or was ignored
- Hardware encoders take a bitrate, not CRF; the preset script sets 12 to 16 Mbps for 1080p and 60 Mbps for 4K. Lower with `--video-bitrate=8M` if size matters more than headroom.
- "hardware accelerated: false" in `--log=verbose` means the codec or platform is unsupported (Lambda, Cloud Run); the render falls back to software with `if-possible`.
- On Linux or Windows without an NVIDIA GPU, `--hardware-acceleration=if-possible` still selects `h264_nvenc` and FFmpeg then fails with "Error while opening encoder". The preset script checks for `nvidia-smi` and drops `--hw` on such machines; when calling `npx remotion render` directly, omit the flag there. macOS always has VideoToolbox.

## Dashboard: compositions list is empty, or a render fails immediately
- The server runs `npx remotion compositions` at start; behind a proxy certificate set `REMOTION_IGNORE_CERTS=1` before `npm run dashboard`. Click "Refresh compositions" after adding a composition.
- "Missing public/script/<id>.json" means the composition's `videoId` has no script yet; run the analyzer or save one in the editor.
- The Node API ignores `remotion.config.ts`; the dashboard mirrors the presets itself. If you change encoding defaults in the config, mirror them in `tools/dashboard/server.mjs` `PRESETS`.
- Renders and tasks run one at a time on purpose; a queued job waits for Whisper to finish.

## Disk full on a 512 GB laptop
- `out/` masters, `node_modules/.cache`, per-project Whisper installs and duplicate headless Chrome copies are the usual culprits. Move the Whisper cache to `~/.cache/remotion-whisper` (the transcribe script's default), delete `out/*.mp4` after upload, and archive 4K masters to an external SSD. Keep 30 GB free.

## ElevenLabs / OpenAI script errors
- 401: key missing from `.env` (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY`); the scripts read `.env` from the project root.
- 422 from ElevenLabs: invalid `model_id` or `voice_id`; list voices with `curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices`.
- Quota errors: rerun with `--only <scene-id>` after a pause instead of regenerating everything.
