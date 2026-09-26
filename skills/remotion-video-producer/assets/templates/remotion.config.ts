/**
 * Remotion configuration used by Studio and the CLI (`npx remotion render`).
 * The Node.js APIs ignore this file; pass the same options to renderMedia() there.
 * Docs: https://remotion.dev/docs/config
 *
 * Tuned for a laptop-class machine (Apple Silicon MacBook Air, 16 GB unified memory):
 * every value below can be overridden per run with a CLI flag or an environment variable.
 */
import os from 'os';
import {Config} from '@remotion/cli/config';

// Faster bundler (default in new projects).
Config.setRspack(true);

// ---- WebGL backend -------------------------------------------------------------------------
// Needed by @remotion/effects, light leaks, shader transitions and HtmlInCanvas.
//   macOS / Windows with a GPU: 'angle'  (on Apple Silicon ANGLE runs on Metal)
//   Linux with a GPU:           'angle-egl'
//   No GPU, Docker, CI:         'swangle' (software; slower but always works)
// Lambda and Cloud Run default to swangle on their own.
type Gl = 'angle' | 'angle-egl' | 'swangle' | 'swiftshader' | 'egl' | 'vulkan';
const gl: Gl =
  (process.env.REMOTION_GL as Gl | undefined) ??
  (process.env.CI ? 'swangle' : process.platform === 'linux' ? 'swangle' : 'angle');
Config.setChromiumOpenGlRenderer(gl);

// ---- Concurrency and performance budget ------------------------------------------------------
// REMOTION_BUDGET is the share of the machine a render may take (default 50%), so other work stays
// responsive. Chrome tabs = cores * budget, capped by memory (each tab holds a frame plus decoded
// media; on 16 GB, 4 tabs at 1080p is the practical ceiling). 50% on 10 cores / 16 GB = 4 tabs.
// Override with REMOTION_CONCURRENCY=n or --concurrency=n. Use 2 for 4K or heavy WebGL scenes.
const cores = os.cpus().length || 4;
const memoryGb = os.totalmem() / 1024 ** 3;
const budget = Math.min(100, Math.max(10, Number(process.env.REMOTION_BUDGET) || 50)) / 100;
const recommendedConcurrency = Math.max(1, Math.min(Math.floor(cores * budget), Math.floor(memoryGb / 4)));
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY) || recommendedConcurrency);

// ---- Color and capture ---------------------------------------------------------------------
// Keep the colors you see in Studio in the exported MP4.
Config.setColorSpace('bt709');
// Frame capture. JPEG is faster; switch to "png" when alpha or exact color is needed.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(90);

// ---- Encoding defaults (software x264, CRF masters) ------------------------------------------
// Platform presets in scripts/render-preset.sh override these. For long-form on a fanless
// laptop, prefer the preset script's --hw flag (VideoToolbox) or set REMOTION_HW=1, which
// switches to hardware encoding with a bitrate (CRF cannot be combined with hardware encoders).
Config.setX264Preset('medium');
Config.setAudioBitrate('320k');
Config.setPixelFormat('yuv420p');
if (process.env.REMOTION_HW === '1') {
  // Hardware mode: bitrate-controlled, no CRF (Remotion rejects both together).
  Config.setHardwareAcceleration('if-possible');
  Config.setVideoBitrate(process.env.REMOTION_VIDEO_BITRATE ?? '16M');
} else {
  Config.setCrf(17);
}

Config.setOverwriteOutput(true);

// Tailwind: if the project uses it, scaffold.sh appends `Config.overrideBundlerConfig(enableTailwind)`
// from '@remotion/tailwind-v4' here. Remember that Tailwind's transition-* / animate-* classes do not
// render in Remotion; drive all motion from useCurrentFrame().

// Give slow fonts/media more time before failing a frame (ms).
Config.setDelayRenderTimeoutInMilliseconds(60000);
