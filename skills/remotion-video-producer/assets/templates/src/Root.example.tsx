import React from 'react';
import {Composition, Folder} from 'remotion';
import {SocialVideo, calculateSocialVideoMetadata, socialVideoSchema} from './compositions/SocialVideo';
import {PLATFORMS} from './lib/platforms';

/**
 * One composition per delivery format, all pointing at the same scenes.
 * Duration is resolved by calculateMetadata from the voiceover manifest.
 * Rename this file to Root.tsx in a fresh project (scaffold.sh does it).
 */
const shared = {
  videoId: 'example',
  accent: '#7C5CFF',
  captionStyle: 'pop' as const,
  music: null,
  endCard: {headline: 'Make it move.', cta: 'Follow for part 2', handle: '@yourhandle'},
  gapSeconds: 0.6,
  showSafeArea: false,
  webglExtras: false,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Vertical">
        <Composition
          id="Shorts"
          component={SocialVideo}
          width={PLATFORMS.shorts.width}
          height={PLATFORMS.shorts.height}
          fps={PLATFORMS.shorts.fps}
          durationInFrames={900}
          schema={socialVideoSchema}
          defaultProps={{...shared, platform: 'shorts'}}
          calculateMetadata={calculateSocialVideoMetadata}
        />
        <Composition
          id="Reels"
          component={SocialVideo}
          width={PLATFORMS.reels.width}
          height={PLATFORMS.reels.height}
          fps={PLATFORMS.reels.fps}
          durationInFrames={900}
          schema={socialVideoSchema}
          defaultProps={{...shared, platform: 'reels'}}
          calculateMetadata={calculateSocialVideoMetadata}
        />
      </Folder>
      <Folder name="Horizontal">
        <Composition
          id="YouTube"
          component={SocialVideo}
          width={PLATFORMS.youtube.width}
          height={PLATFORMS.youtube.height}
          fps={PLATFORMS.youtube.fps}
          durationInFrames={900}
          schema={socialVideoSchema}
          defaultProps={{...shared, platform: 'youtube'}}
          calculateMetadata={calculateSocialVideoMetadata}
        />
      </Folder>
      <Folder name="Square">
        <Composition
          id="Feed"
          component={SocialVideo}
          width={PLATFORMS.feed.width}
          height={PLATFORMS.feed.height}
          fps={PLATFORMS.feed.fps}
          durationInFrames={900}
          schema={socialVideoSchema}
          defaultProps={{...shared, platform: 'feed'}}
          calculateMetadata={calculateSocialVideoMetadata}
        />
      </Folder>
    </>
  );
};
