import React, {useEffect, useState} from 'react';
import {Audio} from '@remotion/media';
import {AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useVideoConfig, type CalculateMetadataFunction} from 'remotion';
import {z} from 'zod';
import {LEAD_SECONDS, loadEpisode, packageUrl, type EpisodeData} from './load';
import {SceneFrame} from './SceneFrame';
import {C, FPS, LAYOUT} from './theme';

export const episodeSchema = z.object({
  /** Package folder name under public/packages (e.g. "ep001"). */
  packageId: z.string(),
  /** Video inside the package ("long" or "short"). */
  video: z.string(),
  captions: z.boolean(),
  music: z.boolean(),
  /** Render only these scene ids (segment rendering); empty = all. */
  onlyScenes: z.array(z.string()),
});

export type EpisodeProps = z.infer<typeof episodeSchema> & {readonly data?: EpisodeData};

let fontsReady: Promise<void> | undefined;
/** Fonts are bundled in public/fonts, so renders never fetch from the network. */
const useFonts = () => {
  const [handle] = useState(() => delayRender('Load bundled fonts'));
  useEffect(() => {
    if (!fontsReady) {
      const faces = [
        new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')})`, {weight: '100 900'}),
        new FontFace('Space Grotesk', `url(${staticFile('fonts/SpaceGrotesk.ttf')})`, {weight: '300 700'}),
      ];
      fontsReady = Promise.all(faces.map((f) => f.load().then((loaded) => document.fonts.add(loaded)))).then(() => undefined);
    }
    fontsReady.then(() => continueRender(handle)).catch(() => continueRender(handle));
  }, [handle]);
};

export const calculateEpisodeMetadata: CalculateMetadataFunction<EpisodeProps> = async ({props, abortSignal}) => {
  const data = await loadEpisode(props.packageId, props.video, abortSignal);
  const ratio = data.video.ratio;
  const L = ratio === '9:16' ? LAYOUT.port : LAYOUT.land;
  return {durationInFrames: data.totalFrames, fps: FPS, width: L.w, height: L.h, props: {...props, data}, defaultOutName: `${props.packageId}_${props.video}`};
};

/**
 * A packaged video: scenes back to back with hard cuts, each playing its slice of the measured voice.
 * Music (a local file declared in package.json) runs underneath at a fixed low level.
 */
export const Episode: React.FC<EpisodeProps> = ({packageId, video, captions, music, onlyScenes, data}) => {
  useFonts();
  const {durationInFrames, width} = useVideoConfig();
  if (!data) return null;
  const vertical = data.video.ratio === '9:16';
  const L = vertical ? LAYOUT.port : LAYOUT.land;
  const scale = width / L.w;
  const eyebrow = `${data.series} · ${data.episode.toUpperCase()}`;
  const only = new Set(onlyScenes);
  // Music dips under speech and comes back up in the gaps (12-frame ramps).
  const speech = data.scenes.filter((s) => s.voice).map((s) => [s.from + LEAD_SECONDS * FPS, s.from + LEAD_SECONDS * FPS + (s.voice!.end - s.voice!.start) * FPS] as const);
  const duck = (f: number) => {
    let d = Infinity;
    for (const [a, z] of speech) {
      if (f >= a && f <= z) return 0.4;
      d = Math.min(d, Math.abs(f - a), Math.abs(f - z));
    }
    return d >= 12 ? 1 : 0.4 + 0.6 * (d / 12);
  };
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <AbsoluteFill style={{width: L.w, height: L.h, scale: String(scale), transformOrigin: '0 0'}}>
        {data.scenes.map((scene) =>
          only.size && !only.has(scene.id) ? null : (
            <Sequence key={scene.id} from={scene.from} durationInFrames={scene.frames} name={`${scene.id} · ${scene.title ?? scene.headline.replace(/\n/g, ' ')}`}>
              <SceneFrame scene={scene} vertical={vertical} brands={data.brands} eyebrow={eyebrow} captions={captions} total={durationInFrames} />
              {scene.voice ? (
                <Sequence from={Math.round(LEAD_SECONDS * FPS)} layout="none" name="Voice">
                  <Audio src={packageUrl(packageId, `voice/${video}/${scene.voice.file}`)} trimBefore={Math.round(scene.voice.start * FPS)} trimAfter={Math.round(scene.voice.end * FPS) + 2} />
                </Sequence>
              ) : null}
            </Sequence>
          ),
        )}
      </AbsoluteFill>
      {music && data.music ? <Audio src={packageUrl(packageId, data.music.file)} volume={(f) => data.music!.level * duck(f)} loop name="Music" /> : null}
    </AbsoluteFill>
  );
};
