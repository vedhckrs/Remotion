import React from 'react';
import {Composition, Folder} from 'remotion';
import {RemotionRoot} from '../Root';
import {Episode, calculateEpisodeMetadata, episodeSchema} from './Episode';
import {LAYOUT, FPS} from './theme';

/**
 * Registered by src/index.ts: the project's own Root (kept across skill updates) plus the packaged-episode
 * compositions. EpisodeLong renders a package's 16:9 video, EpisodeShort its 9:16 video; size and length come
 * from the package, so the defaults below only matter in Studio.
 */
export const AllCompositions: React.FC = () => (
  <>
    <RemotionRoot />
    <Folder name="Packages">
      <Composition id="EpisodeLong" component={Episode} schema={episodeSchema} calculateMetadata={calculateEpisodeMetadata} width={LAYOUT.land.w} height={LAYOUT.land.h} fps={FPS} durationInFrames={FPS * 10} defaultProps={{packageId: 'ep001', video: 'long', captions: true, music: true, onlyScenes: []}} />
      <Composition id="EpisodeShort" component={Episode} schema={episodeSchema} calculateMetadata={calculateEpisodeMetadata} width={LAYOUT.port.w} height={LAYOUT.port.h} fps={FPS} durationInFrames={FPS * 10} defaultProps={{packageId: 'ep001', video: 'short', captions: true, music: true, onlyScenes: []}} />
    </Folder>
  </>
);
