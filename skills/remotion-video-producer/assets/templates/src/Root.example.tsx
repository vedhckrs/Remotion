import React from 'react';
import {Composition, Folder, Still} from 'remotion';
import {SocialVideo, calculateSocialVideoMetadata, socialVideoSchema} from './compositions/SocialVideo';
import {Thumbnail, calculateThumbnailMetadata, thumbnailSchema} from './compositions/Thumbnail';
import {PLATFORMS} from './lib/platforms';

/**
 * One composition per delivery format, all pointing at the same scenes, authored at 60 fps.
 * Render presets capture at --scale=2 for the 4K master (3840x2160 / 2160x3840 / 2160x2700).
 * Duration is resolved by calculateMetadata from the script and the voiceover manifest.
 * Rename this file to Root.tsx in a fresh project (scaffold.sh does it).
 */
const shared = {
  videoId: 'example',
  fps: PLATFORMS.shorts.fps,
  style: 'auto' as const,
  accent: null,
  pacing: 'auto' as const,
  captionStyle: 'auto' as const,
  grade: 'auto' as const,
  background: 'auto' as const,
  logo: null,
  music: null,
  endCard: {headline: 'Make it move.', cta: 'Follow for part 2', handle: '@yourhandle'},
  gapSeconds: null,
  showSafeArea: false,
  webglExtras: false,
};

const comp = (id: string, platform: keyof typeof PLATFORMS) => (
  <Composition
    id={id}
    component={SocialVideo}
    width={PLATFORMS[platform].width}
    height={PLATFORMS[platform].height}
    fps={PLATFORMS[platform].fps}
    durationInFrames={1800}
    schema={socialVideoSchema}
    defaultProps={{...shared, platform}}
    calculateMetadata={calculateSocialVideoMetadata}
  />
);

const thumbDefaults = {videoId: shared.videoId, style: 'auto' as const, accent: null, text: null, highlight: null, image: null, showLogos: true, backgroundFrame: 90};

const still = (id: string, variant: 'youtube' | 'cover' | 'square', width: number, height: number) => (
  <Still id={id} component={Thumbnail} width={width} height={height} schema={thumbnailSchema} defaultProps={{...thumbDefaults, variant}} calculateMetadata={calculateThumbnailMetadata} />
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Vertical">
        {comp('Shorts', 'shorts')}
        {comp('Reels', 'reels')}
      </Folder>
      <Folder name="Horizontal">{comp('YouTube', 'youtube')}</Folder>
      <Folder name="Square">{comp('Feed', 'feed')}</Folder>
      <Folder name="Thumbnails">
        {still('Thumbnail', 'youtube', 1280, 720)}
        {still('Cover', 'cover', 1080, 1920)}
        {still('SquareCover', 'square', 1080, 1080)}
      </Folder>
    </>
  );
};
