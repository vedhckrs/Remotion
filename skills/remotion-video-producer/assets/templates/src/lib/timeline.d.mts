import type {Caption} from '@remotion/captions';
import type {SceneTiming,VoiceoverManifest} from './script';
export declare function computeSceneTimings(scenes: readonly {id:string;durationSeconds:number;minSeconds?:number}[], fps:number, gapSeconds:number, transitionFrames?:number): SceneTiming[];
export declare function totalFrames(timings:readonly SceneTiming[]):number;
export declare function absoluteCaptions(manifest:VoiceoverManifest,timings:readonly SceneTiming[],fps:number):Caption[];
