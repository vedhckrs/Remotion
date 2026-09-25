# Remotion API cheat sheet (v4.0.5xx)

Table of contents
1. Mental model and determinism
2. Compositions, Root, folders, stills
3. Timeline primitives: Sequence, Series, TransitionSeries, Loop, Freeze
4. Animation primitives: interpolate, spring, Easing, noise, paths
5. Media: Video, Audio, images, animated images, Lottie, Rive, 3D
6. Dynamic metadata: calculateMetadata, props, Zod schemas
7. Studio interactivity conventions
8. Fonts and text measurement
9. Effects, canvas components and WebGL
10. CLI commands

## 1. Mental model and determinism

Remotion opens the composition in headless Chrome, sets the frame, screenshots, and moves on. Many tabs render in parallel and do not share state. Therefore a component must render the same pixels for the same frame every time:

- Time comes from `useCurrentFrame()` (integer frame) and `useVideoConfig()` (`fps`, `width`, `height`, `durationInFrames`, `id`).
- No CSS `transition`, `animation`, `@keyframes`, Tailwind `animate-*` / `transition-*`, `requestAnimationFrame`, `setTimeout`, `Date.now()`, `Math.random()`. For randomness use `random(seed)` from `remotion` (deterministic).
- Async work (fetch, font, JSON) must hold the frame: `const {delayRender, continueRender, cancelRender} = useDelayRender()` (or the module-level `delayRender()` / `continueRender(handle)`), and call `continueRender` when done or `cancelRender(err)` on failure. Remotion media components already do this.
- Three.js: no `useFrame()`; drive everything from `useCurrentFrame()`.

## 2. Compositions, Root, folders, stills

```tsx
// src/Root.tsx
import {Composition, Folder, Still} from 'remotion';
import {SocialVideo, socialVideoSchema, calculateSocialVideoMetadata} from './compositions/SocialVideo';

export const RemotionRoot = () => (
  <>
    <Folder name="Vertical">
      <Composition
        id="Reel"
        component={SocialVideo}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={900}
        schema={socialVideoSchema}
        defaultProps={{videoId: 'example', platform: 'reels'}}
        calculateMetadata={calculateSocialVideoMetadata}
      />
    </Folder>
    <Still id="Thumbnail" component={Thumbnail} width={1280} height={720} />
  </>
);
```

- Keep `width/height/fps/durationInFrames/defaultProps` inline (Studio writes edits back only then). Use `type Props = {...}`, not `interface`.
- Folder names: letters, numbers, hyphens only.
- Nest a composition inside another with `<Sequence width={..} height={..}>`; it overrides `useVideoConfig()` for children.
- "Connected compositions": register the same scene component both as its own `<Composition>` and inside the parent's `TransitionSeries`, so Studio gives it its own timeline.

## 3. Timeline primitives

```tsx
<Sequence from={30} durationInFrames={90} name="Title" layout="none" premountFor={15}>
  <Title />
</Sequence>
```
- `from` shifts the start; children see local frames starting at 0. `layout="none"` avoids the wrapping absolute-fill div. `premountFor` mounts the subtree early (use it for anything with media). `trimBefore` starts the children's clock later.
- `<Series>` plays children back to back; `<Series.Sequence offset={-15}>` overlaps.
- `<TransitionSeries>` from `@remotion/transitions`:

```tsx
import {TransitionSeries, linearTiming, springTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';     // direction: from-left|from-right|from-top|from-bottom
import {wipe} from '@remotion/transitions/wipe';
import {flip} from '@remotion/transitions/flip';
import {clockWipe} from '@remotion/transitions/clock-wipe'; // needs {width, height}
import {iris} from '@remotion/transitions/iris';           // needs {width, height}
import {none} from '@remotion/transitions/none';
// Shader-based presentations (WebGL, need --gl=angle): all take optional props and an `effects` array
import {filmBurn} from '@remotion/transitions/film-burn';        // {seed}
import {dreamyZoom} from '@remotion/transitions/dreamy-zoom';    // {rotation, scale}
import {zoomBlur} from '@remotion/transitions/zoom-blur';
import {dissolve} from '@remotion/transitions/dissolve';
import {ripple} from '@remotion/transitions/ripple';
import {crosswarp} from '@remotion/transitions/crosswarp';
import {crossZoom} from '@remotion/transitions/cross-zoom';
import {swap} from '@remotion/transitions/swap';
import {bookFlip} from '@remotion/transitions/book-flip';        // {direction}
import {linearBlur} from '@remotion/transitions/linear-blur';
import {zoomInOut} from '@remotion/transitions/zoom-in-out';
import {blurSlide} from '@remotion/transitions/blur-slide';      // {direction}
import {pushCut} from '@remotion/transitions/push-cut';          // CSS: {outgoingScale, incomingStartScale, flashColor, flashFrames}

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}><SceneA /></TransitionSeries.Sequence>
  <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
  <TransitionSeries.Sequence durationInFrames={120}><SceneB /></TransitionSeries.Sequence>
  <TransitionSeries.Overlay durationInFrames={24} offset={0}><LightLeakOverlay /></TransitionSeries.Overlay>
  <TransitionSeries.Sequence durationInFrames={90}><SceneC /></TransitionSeries.Sequence>
</TransitionSeries>
```
- A transition overlaps neighbours, so total frames = sum(sequences) - sum(transition durations). `timing.getDurationInFrames({fps})` returns a transition's length (spring timings depend on fps).
- An overlay renders on top of the cut without changing the length. An overlay may not sit next to a transition or another overlay.
- `springTiming({config: {damping: 200}, durationInFrames: 20})` for organic, `linearTiming({durationInFrames, easing})` for controlled.
- `<Loop durationInFrames={60} times={3}>` repeats children; `<Freeze frame={30}>` holds a frame.

## 4. Animation primitives

```ts
import {interpolate, spring, Easing, useCurrentFrame, useVideoConfig} from 'remotion';

const frame = useCurrentFrame();
const {fps} = useVideoConfig();

// Range mapping with clamping and an ease-out curve
const opacity = interpolate(frame, [0, 0.3 * fps], [0, 1], {
  easing: Easing.bezier(0.16, 1, 0.3, 1),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});

// Multiple keyframes, one easing per segment
const y = interpolate(frame, [0, 10, 50, 60], [40, 0, 0, -40], {
  easing: [Easing.out(Easing.cubic), Easing.linear, Easing.in(Easing.cubic)],
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
});

// Scale should be perceptual so growth looks linear to the eye
const scale = interpolate(frame, [0, 20], [0.8, 1], {output: 'perceptual-scale', easing: Easing.spring({damping: 200}), extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

// Strings with units and colors interpolate too
const translate = interpolate(frame, [0, 20], ['0px 40px', '0px 0px'], {extrapolateRight: 'clamp'});

// Physics spring, 0 -> 1 by default
const pop = spring({frame, fps, config: {damping: 14, stiffness: 120, mass: 0.8}, delay: 5});
const settle = spring({frame, fps, config: {damping: 200}});                 // no bounce
const timed = spring({frame, fps, durationInFrames: 25, config: {damping: 20}}); // stretched to 25 frames
```
- `interpolate` options: `easing` (fn or array of n-1 fns), `extrapolateLeft/Right: 'extend' | 'clamp' | 'wrap' | 'identity'`, `output: 'linear' | 'perceptual-scale'`, `posterize: n` (sample every n frames for stop-motion looks).
- `Easing`: `linear`, `ease`, `quad`, `cubic`, `sin`, `circle`, `exp`, `bounce`, `poly(n)`, `elastic(b)`, `back(s)`, `bezier(x1,y1,x2,y2)`, `step0`, `step1`, `in(fn)`, `out(fn)`, `inOut(fn)`, `spring({damping, mass, stiffness, overshootClamping})`.
- `spring` config: `damping` (10 default; 200 = no bounce), `stiffness` (100), `mass` (1), `overshootClamping`. Extra: `from`, `to`, `delay`, `reverse`, `durationInFrames`, `durationRestThreshold`. `measureSpring({fps, config})` returns how long it takes to settle.
- `@remotion/noise`: `noise2D(seed, x, y)`, `noise3D(seed, x, y, z)`, `noise4D` -> [-1, 1]. Use `noise2D('cam', frame / 60, 0)` for handheld drift.
- `@remotion/paths`: `evolvePath(progress, d)` -> `{strokeDasharray, strokeDashoffset}` to draw a line; `getLength(d)`, `getPointAtLength(d, len)`, `getTangentAtLength`, `interpolatePath(t, a, b)`, `interpolatePaths(frame, [..], [..], opts)` (Studio-keyframable morph), `reversePath`, `translatePath`, `scalePath`, `getBoundingBox`, `warpPath`, `cutPath`.
- `@remotion/shapes`: `<Rect>`, `<Circle>`, `<Ellipse>`, `<Triangle>`, `<Star>`, `<Polygon>`, `<Pie progress=..>`, `<Heart>`, `<Arrow>`, `<Spark>` (plus `makeRect()` etc. that return path strings for custom SVG).
- `random(seed)` from `remotion` gives a stable pseudo-random number in [0, 1).

## 5. Media

```tsx
import {Video, Audio} from '@remotion/media';
import {Img, CanvasImage, AnimatedImage, staticFile} from 'remotion';

<Video src={staticFile('broll/city.mp4')} trimBefore={2 * fps} trimAfter={8 * fps} from={10} volume={0.4} playbackRate={1} loop objectFit="cover" style={{width: '100%', height: '100%'}} muted={false} name="B-roll" premountFor={30} />
<Audio src={staticFile('voiceover/example/scene-01.mp3')} from={0} volume={(f) => interpolate(f, [0, 10], [0, 1], {extrapolateRight: 'clamp'})} />
<CanvasImage src={staticFile('hero.png')} width={1080} height={1080} effects={[vignette({})]} />
<Img src={staticFile('logo.svg')} style={{width: 240}} />
<AnimatedImage src={staticFile('sticker.webp')} width={300} height={300} loopBehavior="loop" />
```
- `<Video>` / `<Audio>` props: `src`, `from`, `durationInFrames`, `trimBefore`, `trimAfter` (frames), `volume` (number or `(frameOfMedia) => number`), `playbackRate` (no reverse), `loop`, `loopVolumeCurveBehavior`, `muted`, `toneFrequency` (0.01 to 2, render only), `audioStreamIndex`, `objectFit`, `crop{Left,Right,Top,Bottom}` (0 to 1), `style`, `effects`, `name`, `premountFor`, `onError`, `fallbackOffthreadVideoProps`.
- Volume callback `f` starts at 0 when the media starts, not at the composition frame.
- Remote URLs work when the server sends CORS headers. Prefer `public/` + `staticFile()`.
- Media metadata: `mediabunny` (`Input`, `ALL_FORMATS`, `UrlSource`, `input.computeDuration()`, `getPrimaryVideoTrack()`), or `getImageDimensions()` from `remotion`, `getGifDurationInSeconds()` from `@remotion/gif`.
- `@remotion/lottie`: fetch JSON with `delayRender`, then `<Lottie animationData={data} style={{width, height}} playbackRate loop />`.
- `@remotion/rive`: `<RemotionRiveCanvas src=".riv" />`, `onLoad` to set text runs.
- `@remotion/three`: `<ThreeCanvas width height>` with lights; animate meshes from `useCurrentFrame()`; `<Sequence layout="none">` inside.
- `@remotion/animated-emoji`: `<AnimatedEmoji emoji="fire" scale={1} />` after copying assets to `public/`.
- `@remotion/gif`: `<Gif>` when `<AnimatedImage>` is unsupported.
- FFmpeg / FFprobe ship with Remotion: `npx remotion ffmpeg -i in.mov out.mp4`, `npx remotion ffprobe in.mp4`.

## 6. Dynamic metadata, props, schemas

```tsx
import {z} from 'zod';
import {zColor} from '@remotion/zod-types';
import type {CalculateMetadataFunction} from 'remotion';

export const schema = z.object({
  videoId: z.string(),
  platform: z.enum(['youtube', 'shorts', 'reels', 'stories', 'facebook']),
  accent: zColor(),
});
type Props = z.infer<typeof schema>;

export const calculateMetadata: CalculateMetadataFunction<Props> = async ({props, abortSignal}) => {
  const res = await fetch(staticFile(`voiceover/${props.videoId}/manifest.json`), {signal: abortSignal});
  const manifest = await res.json();
  const fps = 30;
  const sceneFrames = manifest.scenes.map((s) => Math.ceil((s.durationSeconds + 0.6) * fps));
  const transitions = (sceneFrames.length - 1) * 12;
  return {
    durationInFrames: sceneFrames.reduce((a, b) => a + b, 0) - transitions,
    props: {...props, sceneFrames},
    defaultOutName: `${props.videoId}_${props.platform}`,
  };
};
```
- Return any of `durationInFrames`, `width`, `height`, `fps`, `props`, `defaultOutName`, `defaultCodec`, `defaultVideoImageFormat`, `defaultPixelFormat`, `defaultProResProfile`.
- Prop resolution order: `defaultProps` -> `--props` / `inputProps` -> `calculateMetadata` -> component.
- `--props='{"videoId":"launch"}'` or `--props=./props.json` on the CLI.

## 7. Studio interactivity conventions

Remotion Studio can select, drag, resize, rotate and keyframe elements when the markup is simple enough:
- Wrap hero elements in `<Interactive.Div name="Headline" style={{...}}>` (also `Interactive.Span`, `Interactive.Svg`, `Interactive.Path`, any tag).
- Keep `style` a literal object: no spreads, no constants, no math outside `interpolate()`.
- Put `interpolate()` inline per property; input range may use `fps`, `durationInFrames`, `width`, `height` with simple `* number` or `- number`; output range, easing, extrapolation are literals.
- Use `scale`, `translate`, `rotate` properties instead of a `transform` string.
- Effects arrays inline with literal params.
- Editable clips: each `<Video>` its own JSX node with literal `from`, `durationInFrames`, `trimBefore`; no `.map()` for clips meant to be dragged.

These rules trade a little DRY-ness for a designer being able to nudge things in Studio. Follow them for headline elements and clip timelines; helper components and data-driven lists may be ordinary React.

## 8. Fonts and text measurement

```tsx
import {loadFont} from '@remotion/google-fonts/Inter';
const {fontFamily, waitUntilDone} = loadFont('normal', {weights: ['400', '700', '900'], subsets: ['latin']});

import {loadFont as loadLocalFont} from '@remotion/fonts';
await loadLocalFont({family: 'Brand', url: staticFile('fonts/Brand-Bold.woff2'), weight: '700'});

import {measureText, fitText, fillTextBox} from '@remotion/layout-utils';
const {fontSize} = fitText({text, withinWidth: 900, fontFamily, fontWeight: '900'});
```
- Call `loadFont` at module level of the component file; it blocks rendering until ready.
- Measure only after `waitUntilDone()`; pass identical `fontFamily/fontSize/fontWeight/letterSpacing` to measure and render; avoid `border`/`padding` differences (use `outline`).

## 9. Effects, canvas components and WebGL

Canvas-backed components (`<Solid>`, `<CanvasImage>`, `<Video>` from `@remotion/media`, `<HtmlInCanvas>`, `<AnimatedImage>`, `<Gif>`, `<RemotionRiveCanvas>`, shapes) accept `effects={[...]}` from `@remotion/effects/<slug>`; effects apply in order.

Catalog: color and grade (`brightness`, `contrast`, `exposure`, `levels`, `vibrance`, `saturation`, `whiteBalance`, `shadowsHighlights`, `colorCorrection`, `lut`, `hue`, `tint`, `duotone`, `grayscale`, `invert`, `colorKey`, `linearGradientTint`, `thermalVision`), blur (`blur`, `linearProgressiveBlur`, `radialProgressiveBlur`, `zoomBlur`), light (`glow`, `dropShadow`, `shine`, `lightLeak`, `lightTrail`, `starburst`), distortion (`barrelDistortion`, `chromaticAberration`, `fisheye`, `cornerPin`, `skew`, `tile`, `tear`, `wave`, `mirror`, `scale`, `uvTranslate`, `xyTranslate`, `noiseDisplacement`, `shrinkwrap`, `roughenEdges`, `outline`, `regionBlur`, `linearProgressivePixelate`, `radialProgressivePixelate`), texture (`noise`, `whiteNoise`, `paper`, `burlap`, `flannel`, `liquidContours`, `speckle`, `emboss`, `dotGrid`, `halftone`, `halftoneLinearGradient`, `pixelate`, `pixelDissolve`, `scanlines`, `tvSignalOff`, `venetianBlinds`, `pattern`, `checkerboard`, `gridlines`, `contourLines`, `lines`, `rings`, `waves`, `zigzag`), `vignette`, `evolve`, `linearGradient`.

```tsx
import {Solid} from 'remotion';
import {lightLeak} from '@remotion/effects/light-leak';
import {vignette} from '@remotion/effects/vignette';
<Solid width={width} height={height} effects={[lightLeak({progress: p, seed: 3, hueShift: 20}), vignette({})]} />
```
- WebGL during renders: `Config.setChromiumOpenGlRenderer('angle')` in `remotion.config.ts` or `--gl=angle` on a desktop GPU; `--gl=angle-egl` on Linux with a GPU; `--gl=swangle` (software) on machines without a GPU, Docker, CI. Lambda defaults to `swangle`.
- `<HtmlInCanvas width height onPaint>` rasterizes children to canvas for pixel effects on arbitrary HTML (Chrome 149+ with `chrome://flags/#canvas-draw-element` for preview; renders work). Do not nest.
- `@remotion/motion-blur`: `<HtmlInCanvasMotionBlur width height samples={8} shutterAngle={180}>` (4.0.529+), or `<Trail>` / `<CameraMotionBlur>` on older versions.
- Custom effects: `createEffect()` from `remotion` with `backend: '2d' | 'webgl2'`.

## 10. CLI commands

```bash
npx create-video@latest --yes --blank --no-tailwind my-video   # scaffold
npx remotion add @remotion/media                                # add a package at the matching version
npx remotion studio --no-open                                   # preview server, prints URL
npx remotion compositions                                       # list composition ids
npx remotion render <id> out/video.mp4 [flags]                  # render
npx remotion still <id> out/frame.png --frame=45                # single frame
npx remotion render <id> out/frames --frames=0,30,90 --image-format=png  # several frames
npx remotion versions                                           # check version alignment
npx remotion upgrade                                            # upgrade all @remotion/* together
npx remotion ffmpeg / ffprobe                                    # bundled binaries
npx remotion lambda ...                                         # AWS Lambda rendering
npx remotion skills add                                         # official Remotion agent skills into the project
```
