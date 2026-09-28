# Motion design in Remotion: the quality bar

Table of contents
1. Why cheap-looking motion happens
2. Easing vocabulary and defaults
3. Entrances, exits and stagger
4. Kinetic typography
5. Camera: the whole scene moves
6. Transitions and cut design
7. Effects, light, grain and grade
8. Motion blur
9. Shapes, paths, particles, data
10. 3D and depth
11. Loops and idle motion
12. Anti-patterns

## 1. Why cheap-looking motion happens

Amateur video: linear tweens, everything enters at once, static backgrounds, transitions that are decorative rather than motivated, motion with no weight. Professional video: every element has mass (ease-out on entry, ease-in on exit), the scene breathes (slow camera), timing has hierarchy (hero first, support second, accents last), and cuts happen on beats (voice, music, or a visual reveal). Build each scene by asking "what does the viewer look at first, and how do I lead their eye to the next thing".

## 2. Easing vocabulary and defaults

Keep these curves in `src/lib/motion.ts` (template) and reach for them by name:

| Name | Curve | Use |
|---|---|---|
| `EASE.emphasizedOut` | `Easing.bezier(0.05, 0.7, 0.1, 1)` | Fluid entrances: text, icons, cards (Material 3 emphasized decelerate) |
| `EASE.emphasizedIn` | `Easing.bezier(0.3, 0, 0.8, 0.15)` | Fluid exits |
| `EASE.smooth` | `Easing.bezier(0.2, 0, 0, 1)` | Position changes, camera, transitions (Material 3 standard) |
| `EASE.out` | `Easing.bezier(0.16, 1, 0.3, 1)` | Expo-out entrance, UI reveals |
| `EASE.in` | `Easing.bezier(0.7, 0, 0.84, 0)` | Exits |
| `EASE.inOut` | `Easing.bezier(0.65, 0, 0.35, 1)` | Camera moves, position changes mid-scene |
| `EASE.snap` | `Easing.bezier(0.2, 0.9, 0.2, 1)` | Fast UI, counters |
| `Easing.spring({damping: 200})` | critically damped | Push without bounce, safe everywhere |
| `spring({config: {damping: 12, stiffness: 140}})` | bouncy | Playful logos, stickers, emoji |
| `spring({config: {damping: 20, stiffness: 90, mass: 1.2}})` | heavy | Large panels, hero cards |
| `SPRING.fluid` `{damping: 26, stiffness: 170}` | critically damped (zeta 1.0, Apple `.smooth`) | Default for text and icons: fastest arrival with zero overshoot |
| `SPRING.snappy` `{damping: 22, stiffness: 240, mass: 0.8}` | zeta 0.8 (Apple `.snappy`) | Badges, pills, counters: alive, not bouncy |
| `SPRING.silk` `{damping: 34, stiffness: 120, mass: 1.2}` | over-damped | Hero images, end-card logo: slow expensive settle |

Durations at 30 fps: entrances 8 to 15 frames, exits 6 to 10 frames, camera moves the length of the scene, transitions 10 to 18 frames. Nothing user-facing moves linearly except progress bars and constant-speed scrolls (tickers, marquees).

For scale use `output: 'perceptual-scale'`. For opacity + translate entrances, start at 30 to 60 px offset, not 200. Rotations for entrances are 3 to 8 degrees, not 45.

## 2b. Fluid motion (the default feel)

"Fluid" is what viewers call motion with no visible start, stop or bounce: every property of an element eases together on one long-tailed curve, siblings flow rather than tick, and nothing ever freezes. The templates default to it (`KineticTitle motion="fluid"`, `Icon animate="fluid"`, fluid transitions) and expose the pieces in `lib/motion.ts`:

- `fluid(frame, fps, {delay, duration})` returns eased 0..1 on the emphasized-decelerate curve; `fluidStyle(p, {distance, blur, scaleFrom})` turns it into opacity + rise + de-blur + settle so an element condenses into place. Use 18 to 24 frames for text, 22 to 30 for icons and cards, 8 to 12 for fast cuts.
- `fluidOut(frame, fps, endFrame)` accelerates away on the emphasized-accelerate curve. Exits are always shorter than entrances (about half).
- `staggerDelay(i, count, total)` distributes delays on an ease-out so early items come quickly and the tail compresses, the way a wave or a crowd arrives; use it instead of a constant gap for more than three siblings.
- `breathe(frame, fps)` keeps held elements alive at 3 percent scale over 3 seconds; `idleFloat` for position; `cameraPush` now uses the standard curve so the scene never visibly starts moving.
- Springs: `SPRING.fluid` (critically damped), `SPRING.snappy` (slight life), `SPRING.silk` (heavy). Reserve `bouncy` for stickers and emoji; overshoot on type reads as cheap.
- Blur as motion: a 6 to 10 px blur that resolves with the entrance sells speed without motion-blur passes; keep it under 12 px and off when more than ~30 elements animate at once (each blur is a filter pass at 4K).
- Overlap: start the next element while the previous one is at ~60 percent; never wait for a full stop. Transitions in the fluid catalog (`smoothFade`, `glideSlide`, `liquidWipe`, `irisReveal`) follow the same idea: the outgoing scene keeps moving (drifts, scales back) while the incoming one arrives.

Research behind the numbers: Material 3 easing tokens (emphasized decelerate `0.05, 0.7, 0.1, 1`, standard `0.2, 0, 0, 1`), Apple SwiftUI spring presets (`.smooth` critically damped, `.snappy` slightly under-damped, `.bouncy` under-damped), and Disney's follow-through / overlapping action / slow-in slow-out principles. Sources: [m3.material.io easing and duration](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs), [SwiftUI spring reference](https://github.com/GetStream/swiftui-spring-animations), [Apple spring(response:dampingFraction:)](https://developer.apple.com/documentation/SwiftUI/Animation/spring(response:dampingFraction:blendDuration:)).

## 3. Entrances, exits and stagger

The staggered spring is the workhorse for energetic content; for the fluid default see 2b. With springs:

```tsx
const enter = (i: number) => spring({frame, fps, delay: i * 3, config: {damping: 200}});
// per element: opacity: enter(i), translate: `0px ${(1 - enter(i)) * 40}px`
```

- Stagger 2 to 4 frames between siblings; 1 frame between letters; 4 to 6 frames between cards.
- Exit before the next scene's entrance so both never fight for attention: fade + move out over 6 to 10 frames ending at the scene's last frame (use `durationInFrames - 8` as the exit start).
- Mask reveals feel more expensive than fades: wrap text in a `div` with `overflow: hidden` and translate the inner element up from 100 percent.
- For lines of text, reveal by line, not by word, unless it is a hook.

## 4. Kinetic typography

The `KineticTitle` template does word-by-word spring entrance with an optional highlight word. Guidance:
- Hooks: one idea, 2 to 5 words, 96 to 120 px, weight 900, tight `letterSpacing: -0.03em`, `lineHeight: 0.95`.
- Emphasize one word per headline: color, `Highlight` / `Underline` from `@remotion/rough-notation` driven by `progress`, or a scale pop of 1.06 on its beat.
- Numbers: count up with `interpolate` + `Math.round`, ease-out, and format with `toLocaleString`. Add a subtle `posterize: 2` for a mechanical odometer feel.
- Fit long copy with `fitText` from `@remotion/layout-utils`, and cap at the platform maximum.
- Text on footage needs a treatment: 40 to 60 percent dark scrim, a blurred backdrop card (`backdropFilter: 'blur(24px)'`), or a solid label bar. Never raw white text over busy video.
- Do not animate letter-spacing or font-weight per frame with variable fonts unless the font supports it cleanly; animate `scale` and `translate` instead.

## 5. Camera: the whole scene moves

Wrap scene content in a container and drive it:

```tsx
const drift = noise2D('cam', frame / 90, 0) * 6;      // handheld sway in px
const push = interpolate(frame, [0, durationInFrames], [1, 1.06], {easing: EASE.inOut}); // slow push-in
<AbsoluteFill style={{scale: String(push), translate: `${drift}px 0px`}}>...</AbsoluteFill>
```
- Push-in 4 to 8 percent over a scene for talking-head or hero shots; pull-out for reveals.
- Parallax: background moves 30 percent of the foreground's translate; three layers maximum.
- Whip-pan cut: 6-frame translate of 100 percent with `blur()` effect ramp, then the next scene enters from the opposite side.
- Ken Burns on stills (`KenBurnsImage` template): start scale 1.05 to 1.15, drift 2 to 4 percent, ease-in-out, pick a focal point per image.

## 6. Transitions and cut design

Two catalogs in `lib/transitions.tsx`, chosen by the `transitions` prop of `SocialVideo`: `fluid` (default: `smoothFade` crossfade with condense and de-blur, `glideSlide` continuous camera-like glide, `liquidWipe` organic noise-shaped edge, `irisReveal` soft circle, plus a softened zoom and whip for fast pacing) and `hard` (slams, push cuts, whip pans, glitch) for hype content. `transitionTiming()` gives the built-in presentations the standard curve so nothing moves linearly.

Motivate every transition: a cut when the voice starts a new sentence, a wipe in the direction of motion, a light leak on an emotional beat, a zoom-through on "and here's how".

- Default: hard cut with an entrance animation on the new scene. Fewer transitions read as more confident.
- `fade()` 10 to 12 frames for mood changes; `slide()` / `wipe()` / `blurSlide()` 12 to 15 frames matching the direction of the exiting motion; `clockWipe` / `iris` for reveals; `flip` / `bookFlip` sparingly (product spins, comparisons).
- Shader presentations for cinematic cuts (WebGL): `filmBurn` (organic burn-through, pairs with a music swell), `dreamyZoom` (soft zoom + rotation), `zoomBlur` / `crossZoom` (impact), `dissolve` (noise dissolve), `ripple`, `crosswarp`, `swap`, `linearBlur`, `zoomInOut`. `pushCut()` is CSS-only: a scale push with a flash frame built in (`flashColor`, `flashFrames`), ideal for beat drops.
- Light leak overlay (`LightLeakOverlay` template with `lightLeak()` effect) over a hard cut: 20 to 28 frames, `hueShift` toward the brand color.
- Match cuts: end scene A with the hero at the position where scene B's hero starts.
- Flash frame: a 2-frame white or brand-color `Solid` at the cut, used once or twice per video for impact beats.
- Sound every transition with an SFX (`whoosh`, `whip`, `switch`) placed at the cut frame, 20 to 40 percent volume.

## 7. Effects, light, grain and grade

A subtle finishing pass separates flat renders from cinematic ones:
- Vignette (`vignette({})` on a `<Solid>` overlay or on the video) at low strength.
- Film grain: `noise({...})` or `whiteNoise` at 3 to 6 percent opacity, animated by seeding with the frame (`seed: frame`), on a full-frame `<Solid>` with `mixBlendMode: 'overlay'`.
- Glow on titles: `glow()` effect on `<HtmlInCanvas>` or a CSS `textShadow` stack (`0 0 24px rgba(brand,0.6), 0 0 64px rgba(brand,0.3)`).
- Chromatic aberration and zoom blur only on impact frames, 3 to 6 frames, then off.
- Color grade: `exposure`, `levels`, `whiteBalance`, `shadowsHighlights`, `vibrance`, `saturation`, `tint` / `duotone`, or a `.cube` LUT via `lut()` on footage to unify mixed sources; or a CSS `filter` on a wrapper for HTML content.
- Backgrounds: the single-hue `Background` systems (section 8c), or `halftoneLinearGradient` / `waves` / `contourLines` effects on a `<Solid>` in one tonal color. No multi-color blobs or gradients.
- All `@remotion/effects`, shader transitions and light leaks need a WebGL backend (`angle` on desktop GPU, `swangle` without a GPU). Keep them opt-in so a render never fails on a machine without GL; the templates expose `webgl` props for this.

## 8. Motion blur

Fast moves without motion blur look like PowerPoint. Options:
- `<HtmlInCanvasMotionBlur width height samples={8} shutterAngle={180}>` from `@remotion/motion-blur` (4.0.529+, best quality; preview needs the Chrome canvas-draw-element flag; renders are fine).
- `<Trail layers={4} lagInFrames={0.15} trailOpacity={0.6}>` and `<CameraMotionBlur shutterAngle={180} samples={10}>` from the same package for older versions.
- `zoomBlur` / `blur` effects ramped by `interpolate` on whip pans.
- Cost: samples multiply render time. Use on hero moves only.

## 8b. Neon, 3D camera rig, impact hits (template components)

- `NeonText`: layered glow, deterministic tube-ignition flicker, breathing pulse, optional extrusion; `font="impact"` for Anton. Pair with `Camera3D` and the `spotlight` background for a neon stage (script `visual.type: "neon"`).
- `Camera3D` + `Layer depth` + `Card3D`: CSS perspective rig with pan / tilt / roll / dolly keyframes in seconds and `handheld` noise. Layers at negative depth move less (background), positive depth more (foreground). Oversize far layers (`style={{scale: '1.4'}}`) so rotation never reveals edges. Three layers is plenty.
- `ImpactFlash at={[0, 45]}`: accent or white flash plus a 2 to 3 percent scale bump on beats; the composition adds one on every cut in `fast` pacing.
- `pickTransition(pacing, index)` in `lib/transitions.tsx` cycles zoom punch / push cut with flash / whip pan / glitch slam for fast, slide / fade / soft zoom for medium, fades for calm. All CSS; shader presentations can be swapped in with `webglExtras`.

## 8c. Animated backgrounds (template `Background`)

Ten systems, all frame-driven, single-hue and themed, in `components/Background.tsx`: solid, tonal, spotlight, grid, dots, particles, rays, waves, streaks, paper. Speed is in real seconds (`speed` multiplies), intensity scales opacity, and every system fades toward a vignette so text stays legible. Pair energy with pacing: streaks / grid / spotlight for fast, tonal / waves / rays for calm, dots / particles / solid behind data. Never stack two busy systems; one background, one subject, one accent.

## 9. Shapes, paths, particles, data

- `@remotion/shapes` for clean geometry: `<Rect>`, `<Circle>`, `<Star>`, `<Pie progress>` (radial progress), `<Arrow>`, `<Spark>`.
- Draw-on lines and logos: `evolvePath(progress, d)` -> `strokeDasharray/offset` on an SVG path. Combine with `getPointAtLength` to move a dot along the line.
- Morphing: `interpolatePaths(frame, [0, 30], [dA, dB])` inline on `<Interactive.Path>`.
- Particles: 40 to 120 elements positioned with `random(i)` and animated by `frame`; keep them as absolutely positioned `div`s or one SVG. Do not exceed a few hundred DOM nodes.
- Charts: `charts/BarChart` (staggered spring growth, leader highlighted, values count up), `charts/LineChart` (smooth path drawn on with `evolvePath`, glowing head dot, area fill, live value), `charts/DonutChart` (sweep, single progress or shares), `Counter` (tabular count-up). `InfographicScene` lays them out per platform from the script's `visual.chart`. Match the platform text minimums; title the chart with the takeaway.
- Audio-reactive: `useWindowedAudioData` + `visualizeAudio` from `@remotion/media-utils` for bars, waveforms and bass-driven scale (see `audio-voiceover.md`).

## 10. 3D and depth

- CSS 3D first: `perspective: 1200px` on a parent, `rotateX/rotateY` on cards, `transformStyle: 'preserve-3d'`. Cheap and renders anywhere.
- `@remotion/three` for real 3D (product spins, logo extrusions, environments). Lights required; animate only from `useCurrentFrame()`; `<Sequence layout="none">` inside the canvas.
- `cube()` transition for 3D scene changes.
- Fake depth with layered parallax, drop shadows that grow with scale, and blur on far layers.

## 11. Loops and idle motion

Anything on screen for more than 2 s needs idle motion: a slow float (`Math.sin(frame / 20) * 4` px), rotating gradient angle, breathing scale (1 to 1.02), shimmer sweep across a button, blinking cursor. Make loop lengths divide the scene duration when the scene is a perfect loop (Shorts that restart).

## 12. Anti-patterns

- Everything animating at once; elements without a hierarchy.
- Linear tweens on anything the viewer looks at.
- Bounce on serious content; bounce on more than one element at a time.
- Transitions longer than 20 frames; a different transition on every cut.
- Text that appears and immediately disappears (minimum on-screen time = reading time, ~0.25 s per word plus 0.6 s).
- Text or logos inside the platform UI zones.
- Motion that continues after the voice moves on (trim the scene to the voice).
- Raw stock footage with no grade, scrim or crop.
