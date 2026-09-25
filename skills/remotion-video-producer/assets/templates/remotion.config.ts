/**
 * Remotion configuration used by Studio and the CLI (`npx remotion render`).
 * The Node.js APIs ignore this file; pass the same options to renderMedia() there.
 * Docs: https://remotion.dev/docs/config
 */
import {Config} from '@remotion/cli/config';

// Faster bundler (default in new projects).
Config.setRspack(true);

// WebGL is required by @remotion/effects, light leaks, shader transitions and HtmlInCanvas.
// 'angle' on a desktop with a GPU, 'angle-egl' on Linux with a GPU, 'swangle' (software) in
// Docker / CI / any machine without a GPU. Lambda and Cloud Run already default to swangle.
// Override per run with `npx remotion render ... --gl=swangle` or REMOTION_GL for the preset script.
Config.setChromiumOpenGlRenderer(process.env.REMOTION_GL === 'swangle' || process.env.CI ? 'swangle' : 'angle');

// Keep the colors you see in Studio in the exported MP4.
Config.setColorSpace('bt709');

// Frame capture. JPEG is faster; switch to "png" when alpha or exact color is needed.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(90);

// Quality defaults for H.264 masters. Platform presets in scripts/render-preset.sh override these.
Config.setCrf(17);
Config.setAudioBitrate('320k');
Config.setPixelFormat('yuv420p');

Config.setOverwriteOutput(true);

// Give slow fonts/media more time before failing a frame (ms).
Config.setDelayRenderTimeoutInMilliseconds(60000);
