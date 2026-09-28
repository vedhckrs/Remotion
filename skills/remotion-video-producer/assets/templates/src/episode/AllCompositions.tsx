import React from 'react';
import {RemotionRoot} from '../Root';
import {EpisodeCompositions} from './EpisodeCompositions';

/**
 * Registered by src/index.ts for Studio: the project's own Root (kept across skill updates) plus the packaged
 * episodes. Package renders use src/episode/entry.ts instead, which loads only the episodes (no web fonts, no
 * network), so a font download in another template can never break an episode render.
 */
export const AllCompositions: React.FC = () => (
  <>
    <RemotionRoot />
    <EpisodeCompositions />
  </>
);
