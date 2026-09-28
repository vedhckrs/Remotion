import React, {useCallback} from 'react';
import {Audio} from '@remotion/media';
import {interpolate, useVideoConfig} from 'remotion';
import {fr} from '../lib/motion';

export type VoiceSegment = {readonly startSeconds: number; readonly endSeconds: number};

/**
 * Music track that ducks under voice segments and fades out at the end.
 * Levels are linear gain: 0.18 is roughly -15 dB, 0.07 roughly -23 dB.
 */
export const MusicBed: React.FC<{
  readonly src: string;
  readonly segments?: readonly VoiceSegment[];
  readonly musicLevel?: number;
  readonly duckedLevel?: number;
  readonly preRollSeconds?: number;
  readonly postRollSeconds?: number;
  readonly rampFrames?: number;
  readonly fadeInFrames?: number;
  readonly fadeOutFrames?: number;
  readonly trimBefore?: number;
  readonly loop?: boolean;
}> = ({
  src,
  segments = [],
  musicLevel = 0.18,
  duckedLevel = 0.07,
  preRollSeconds = 0.3,
  postRollSeconds = 0.4,
  rampFrames = 8,
  fadeInFrames = 20,
  fadeOutFrames = 50,
  trimBefore = 0,
  loop = true,
}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const ramp = fr(rampFrames, fps);
  const fadeInF = fr(fadeInFrames, fps);
  const fadeOutF = fr(fadeOutFrames, fps);

  const volume = useCallback(
    (f: number) => {
      // Envelope for the whole track.
      const fadeIn = interpolate(f, [0, fadeInF], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      const fadeOut = interpolate(f, [durationInFrames - fadeOutF, durationInFrames - 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

      // Ducking: find the deepest duck across all segments at this frame.
      let duck = 1;
      for (const seg of segments) {
        const start = (seg.startSeconds - preRollSeconds) * fps;
        const end = (seg.endSeconds + postRollSeconds) * fps;
        const d = interpolate(f, [start - ramp, start, end, end + ramp], [1, 0, 0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        duck = Math.min(duck, d);
      }
      const level = duckedLevel + (musicLevel - duckedLevel) * duck;
      return level * fadeIn * fadeOut;
    },
    [segments, fps, durationInFrames, musicLevel, duckedLevel, preRollSeconds, postRollSeconds, ramp, fadeInF, fadeOutF],
  );

  return <Audio src={src} volume={volume} loop={loop} loopVolumeCurveBehavior="extend" trimBefore={trimBefore} name="Music" />;
};
