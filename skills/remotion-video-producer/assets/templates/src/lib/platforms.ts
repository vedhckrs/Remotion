import {useVideoConfig} from 'remotion';

/**
 * Platform canvases, safe zones and logo slots.
 *
 * Compositions are authored at the 1080-class canvas and 60 fps; the render presets capture at
 * --scale=2 to produce the 4K master (3840x2160 horizontal, 2160x3840 vertical, 2160x2700 4:5).
 * Safe insets are given in pixels at the reference canvas and scaled to the actual composition
 * size, so a 4K or nested composition gets the same proportions.
 */
export type PlatformId =
  | 'youtube'
  | 'youtube-4k'
  | 'shorts'
  | 'reels'
  | 'stories'
  | 'feed'
  | 'facebook'
  | 'facebook-feed'
  | 'square';

export type Orientation = 'vertical' | 'horizontal' | 'square';

export type SafeInsets = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export type PlatformSpec = {
  readonly id: PlatformId;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** Authoring frame rate. Masters are 60 fps; platforms accept 60. */
  readonly fps: number;
  /** 4K master size produced by --scale=2. */
  readonly master: {readonly width: number; readonly height: number};
  readonly maxSeconds: number;
  readonly orientation: Orientation;
  /** Pixels at the reference width/height that platform UI may cover. */
  readonly safe: SafeInsets;
};

export const MASTER_FPS = 60;
export const MASTER_SCALE = 2;

// Conservative union of YouTube Shorts, Instagram Reels/Stories and Facebook Reels chrome (Sept 2026).
const VERTICAL_SAFE: SafeInsets = {top: 270, bottom: 420, left: 72, right: 150};
const HORIZONTAL_SAFE: SafeInsets = {top: 54, bottom: 96, left: 96, right: 96};
const SQUARE_SAFE: SafeInsets = {top: 60, bottom: 60, left: 60, right: 60};

const spec = (id: PlatformId, label: string, width: number, height: number, maxSeconds: number, orientation: Orientation, safe: SafeInsets): PlatformSpec => ({
  id,
  label,
  width,
  height,
  fps: MASTER_FPS,
  master: {width: width * MASTER_SCALE, height: height * MASTER_SCALE},
  maxSeconds,
  orientation,
  safe,
});

export const PLATFORMS: Record<PlatformId, PlatformSpec> = {
  youtube: spec('youtube', 'YouTube 16:9', 1920, 1080, 12 * 3600, 'horizontal', HORIZONTAL_SAFE),
  'youtube-4k': {...spec('youtube-4k', 'YouTube 16:9 native 4K', 3840, 2160, 12 * 3600, 'horizontal', HORIZONTAL_SAFE), master: {width: 3840, height: 2160}},
  shorts: spec('shorts', 'YouTube Shorts', 1080, 1920, 180, 'vertical', VERTICAL_SAFE),
  reels: spec('reels', 'Instagram Reels', 1080, 1920, 180, 'vertical', VERTICAL_SAFE),
  stories: spec('stories', 'Instagram / Facebook Stories', 1080, 1920, 60, 'vertical', VERTICAL_SAFE),
  feed: spec('feed', 'Instagram Feed 4:5', 1080, 1350, 3600, 'square', SQUARE_SAFE),
  facebook: spec('facebook', 'Facebook Reels', 1080, 1920, 90, 'vertical', VERTICAL_SAFE),
  'facebook-feed': spec('facebook-feed', 'Facebook Feed 4:5', 1080, 1350, 14400, 'square', SQUARE_SAFE),
  square: spec('square', 'Square 1:1', 1080, 1080, 3600, 'square', SQUARE_SAFE),
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

export type SafeRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
};

export const orientationFor = (width: number, height: number): Orientation => {
  if (height > width * 1.2) return 'vertical';
  if (width > height * 1.2) return 'horizontal';
  return 'square';
};

const insetsFor = (orientation: Orientation): SafeInsets => {
  if (orientation === 'vertical') return VERTICAL_SAFE;
  if (orientation === 'horizontal') return HORIZONTAL_SAFE;
  return SQUARE_SAFE;
};

/** Safe rectangle for any canvas, scaled from the reference platform insets. */
export const getSafeRect = (width: number, height: number, platform?: PlatformId): SafeRect => {
  const orientation = platform ? PLATFORMS[platform].orientation : orientationFor(width, height);
  const insets = platform ? PLATFORMS[platform].safe : insetsFor(orientation);
  const refWidth = orientation === 'horizontal' ? 1920 : 1080;
  const refHeight = orientation === 'horizontal' ? 1080 : orientation === 'vertical' ? 1920 : height * (1080 / width);
  const sx = width / refWidth;
  const sy = height / refHeight;
  const x = insets.left * sx;
  const y = insets.top * sy;
  const w = width - (insets.left + insets.right) * sx;
  const h = height - (insets.top + insets.bottom) * sy;
  return {x, y, width: w, height: h, centerX: x + w / 2, centerY: y + h / 2};
};

export type LogoCorner = 'top-left' | 'top-right' | 'top-center' | 'bottom-left';

export type LogoSlot = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly corner: LogoCorner;
};

/**
 * Where a logo or watermark survives every platform's chrome.
 * Vertical: top-left inside the safe rect (below the Reels profile row, left of the Shorts rail).
 * Horizontal: top-left or top-right; never bottom-right (YouTube end screen, progress bar).
 * Size: about 9% of width on vertical, 7% on horizontal, capped to the safe rect.
 */
export const getLogoSlot = (width: number, height: number, corner: LogoCorner = 'top-left', platform?: PlatformId, scale = 1): LogoSlot => {
  const safe = getSafeRect(width, height, platform);
  const orientation = platform ? PLATFORMS[platform].orientation : orientationFor(width, height);
  const unit = orientation === 'horizontal' ? width / 1920 : width / 1080;
  const size = Math.min(safe.width * 0.5, (orientation === 'horizontal' ? 0.07 : 0.09) * width * scale);
  const margin = 12 * unit;
  const y = corner === 'bottom-left' ? safe.y + safe.height - size - margin : safe.y + margin;
  const x = corner === 'top-right' ? safe.x + safe.width - size - margin : corner === 'top-center' ? safe.centerX - size / 2 : safe.x + margin;
  return {x, y, width: size, height: size, corner};
};

/** Horizontal band (inside the safe rect) where captions should sit. */
export const getCaptionBand = (width: number, height: number, platform?: PlatformId) => {
  const safe = getSafeRect(width, height, platform);
  const orientation = platform ? PLATFORMS[platform].orientation : orientationFor(width, height);
  const top = orientation === 'vertical' ? safe.y + safe.height * 0.74 : safe.y + safe.height * 0.7;
  return {x: safe.x, y: top, width: safe.width, height: orientation === 'vertical' ? safe.height * 0.2 : safe.height * 0.18};
};

export type PlatformLayout = {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly orientation: Orientation;
  /** 1 at 1080 px wide (or 1920 wide for horizontal). Multiply font sizes and paddings by this. */
  readonly unit: number;
  readonly safe: SafeRect;
  readonly logo: LogoSlot;
  readonly isVertical: boolean;
  readonly isHorizontal: boolean;
};

/** Layout helper derived from the current composition. Works in nested sequences with custom sizes too. */
export const usePlatformLayout = (platform?: PlatformId): PlatformLayout => {
  const {width, height, fps} = useVideoConfig();
  const orientation = platform ? PLATFORMS[platform].orientation : orientationFor(width, height);
  const unit = orientation === 'horizontal' ? width / 1920 : width / 1080;
  const safe = getSafeRect(width, height, platform);
  const logo = getLogoSlot(width, height, 'top-left', platform);
  return {width, height, fps, orientation, unit, safe, logo, isVertical: orientation === 'vertical', isHorizontal: orientation === 'horizontal'};
};
