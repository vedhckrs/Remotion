import React from 'react';
import {Composition, Folder} from 'remotion';
import {SocialVideo, calculateSocialVideoMetadata, socialVideoSchema} from './compositions/SocialVideo';
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
  accent: '#7C5CFF',
  pacing: 'auto' as const,
  captionStyle: 'hormozi' as const,
  grade: 'none' as const,
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

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Vertical">
        {comp('Shorts', 'shorts')}
        {comp('Reels', 'reels')}
      </Folder>
      <Folder name="Horizontal">{comp('YouTube', 'youtube')}</Folder>
      <Folder name="Square">{comp('Feed', 'feed')}</Folder>
    </>
  );
};
