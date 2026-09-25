import {useVideoConfig} from 'remotion';

/**
 * Platform canvases and safe zones. Safe insets are given in pixels at the
 * reference canvas and scaled to the actual composition size, so a 4K
 * composition gets the same proportions.
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
  readonly fps: number;
  readonly maxSeconds: number;
  readonly orientation: Orientation;
  /** Pixels at the reference width/height that platform UI may cover. */
  readonly safe: SafeInsets;
};

// Conservative union of YouTube Shorts, Instagram Reels/Stories and Facebook Reels chrome (Sept 2026).
const VERTICAL_SAFE: SafeInsets = {top: 270, bottom: 420, left: 72, right: 150};
const HORIZONTAL_SAFE: SafeInsets = {top: 54, bottom: 96, left: 96, right: 96};
const SQUARE_SAFE: SafeInsets = {top: 60, bottom: 60, left: 60, right: 60};

export const PLATFORMS: Record<PlatformId, PlatformSpec> = {
  youtube: {id: 'youtube', label: 'YouTube 1080p', width: 1920, height: 1080, fps: 30, maxSeconds: 12 * 3600, orientation: 'horizontal', safe: HORIZONTAL_SAFE},
  'youtube-4k': {id: 'youtube-4k', label: 'YouTube 4K', width: 3840, height: 2160, fps: 30, maxSeconds: 12 * 3600, orientation: 'horizontal', safe: HORIZONTAL_SAFE},
  shorts: {id: 'shorts', label: 'YouTube Shorts', width: 1080, height: 1920, fps: 30, maxSeconds: 180, orientation: 'vertical', safe: VERTICAL_SAFE},
  reels: {id: 'reels', label: 'Instagram Reels', width: 1080, height: 1920, fps: 30, maxSeconds: 180, orientation: 'vertical', safe: VERTICAL_SAFE},
  stories: {id: 'stories', label: 'Instagram / Facebook Stories', width: 1080, height: 1920, fps: 30, maxSeconds: 60, orientation: 'vertical', safe: VERTICAL_SAFE},
  feed: {id: 'feed', label: 'Instagram Feed 4:5', width: 1080, height: 1350, fps: 30, maxSeconds: 3600, orientation: 'square', safe: SQUARE_SAFE},
  facebook: {id: 'facebook', label: 'Facebook Reels', width: 1080, height: 1920, fps: 30, maxSeconds: 90, orientation: 'vertical', safe: VERTICAL_SAFE},
  'facebook-feed': {id: 'facebook-feed', label: 'Facebook Feed 4:5', width: 1080, height: 1350, fps: 30, maxSeconds: 14400, orientation: 'square', safe: SQUARE_SAFE},
  square: {id: 'square', label: 'Square 1:1', width: 1080, height: 1080, fps: 30, maxSeconds: 3600, orientation: 'square', safe: SQUARE_SAFE},
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

export type PlatformLayout = {
  readonly width: number;
  readonly height: number;
  readonly orientation: Orientation;
  /** 1 at 1080 px wide (or 1920 wide for horizontal). Multiply font sizes and paddings by this. */
  readonly unit: number;
  readonly safe: SafeRect;
  readonly isVertical: boolean;
  readonly isHorizontal: boolean;
};

/** Layout helper derived from the current composition. Works in nested sequences with custom sizes too. */
export const usePlatformLayout = (platform?: PlatformId): PlatformLayout => {
  const {width, height} = useVideoConfig();
  const orientation = platform ? PLATFORMS[platform].orientation : orientationFor(width, height);
  const unit = orientation === 'horizontal' ? width / 1920 : width / 1080;
  const safe = getSafeRect(width, height, platform);
  return {width, height, orientation, unit, safe, isVertical: orientation === 'vertical', isHorizontal: orientation === 'horizontal'};
};
