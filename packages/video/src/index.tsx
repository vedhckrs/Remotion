import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { SemanticExplainer } from './Composition';
import { demo } from './demo';
import { sceneTimeline } from './motion';
const Root = () => <Composition id="SemanticExplainer" component={SemanticExplainer} width={1920} height={1080} fps={60} durationInFrames={240} defaultProps={{ spec: demo }} calculateMetadata={({ props }) => ({ durationInFrames: sceneTimeline(props.spec.scenes, 60).reduce((n, s) => n + s.duration, 0) })}/>;
registerRoot(Root);
