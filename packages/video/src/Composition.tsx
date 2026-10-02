import { AssetUrls } from './AssetUrls';
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import { SceneSpecSchema, type SceneSpec } from '@nuradi/schemas/index';
import { sceneTimeline } from './motion';
import { SceneRenderer } from './SceneRenderer';
import { useFonts } from './Fonts';
export function SemanticExplainer({ spec, assetUrls = {} }: {
    spec: SceneSpec;
    assetUrls?: Record<string, string>;
}) { const fonts = useFonts(); const parsed = SceneSpecSchema.parse(spec), { fps } = useVideoConfig(); const timeline = sceneTimeline(parsed.scenes, fps); if (!fonts)
    return null; return <AssetUrls.Provider value={assetUrls}>{parsed.scenes.map((scene, i) => <Sequence key={scene.id} from={timeline[i].from} durationInFrames={timeline[i].duration}><SceneRenderer scene={scene} spec={parsed}/></Sequence>)}</AssetUrls.Provider>; }
