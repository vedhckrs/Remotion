// Entry point for package renders (package-render.mjs, package-stills.mjs): the episode compositions only, fully
// offline. Studio keeps using src/index.ts, which also shows the project's other templates.
import {registerRoot} from 'remotion';
import {EpisodeCompositions} from './EpisodeCompositions';

registerRoot(EpisodeCompositions);
