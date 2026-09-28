import {alpha, ensureContrast, isDark, lift, readableOn, textShadowFor, tone} from './color';
import type {GradeName} from './grades';
import type {Pacing} from './motion';
import {brandStyles} from './brand-styles';
import {FONT_FAMILIES, theme, type Theme, type ThemeColors} from './theme';

/**
 * Style presets: one word in the script ("style": "midnight-neon") sets colors, fonts, caption
 * look, grade, background system and pacing bias for the whole video and its thumbnail, so a
 * channel's videos stay consistent while each concept still gets its own accent.
 *
 * Color rules baked in (references/visual-design.md, "Color theory for video"):
 *  - One dominant background hue, solid or tonal. No multi-color gradients anywhere.
 *  - Text, muted, surface, line and scrim are DERIVED from the background luminance, so a light
 *    preset gets near-black type and a dark preset gets white type automatically.
 *  - The accent is pushed to at least 3:1 against the background; `onAccent` is computed so text
 *    on accent pills always reads. `accent2` is analogous (a tonal shift of the accent) and only
 *    used for data series.
 * Add a preset per channel or client; keep the shape identical so components never special-case.
 */
export const BACKGROUND_KINDS = ['solid', 'tonal', 'spotlight', 'grid', 'dots', 'particles', 'rays', 'waves', 'streaks', 'paper'] as const;
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number];

export type CaptionStyleName = 'hormozi' | 'pop' | 'boxed' | 'karaoke' | 'outline' | 'minimal';

export type StylePreset = {
  readonly id: string;
  readonly label: string;
  readonly concept: string;
  readonly theme: Theme;
  readonly captionStyle: CaptionStyleName;
  readonly grade: GradeName;
  readonly background: BackgroundKind;
  readonly pacing: Pacing;
  /** Second background for infographic scenes, so data reads cleanly. */
  readonly dataBackground: BackgroundKind;
  /** Thumbnail treatment. */
  readonly thumbnail: {readonly font: string; readonly textCase: 'upper' | 'none'; readonly accentBlock: boolean};
};

type ColorSeed = {readonly bg: string; readonly accent: string; readonly accent2?: string; readonly highlight?: string; readonly text?: string; readonly surface?: string};

/**
 * Derive every dependent color role from the background and accent. This is the one place that
 * decides "white text on black, black text on cream"; components just read the roles.
 */
export const deriveColors = (seed: ColorSeed): ThemeColors => {
  const dark = isDark(seed.bg);
  const text = seed.text ?? readableOn(seed.bg, '#F5F5F7', '#141414');
  const accent = ensureContrast(seed.accent, seed.bg, 3);
  return {
    bg: seed.bg,
    surface: seed.surface ?? lift(seed.bg, 6),
    text,
    muted: alpha(text, dark ? 0.64 : 0.6),
    accent,
    onAccent: readableOn(accent, '#FFFFFF', '#111111'),
    accent2: seed.accent2 ? ensureContrast(seed.accent2, seed.bg, 3) : tone(accent, dark ? 22 : -22),
    highlight: ensureContrast(seed.highlight ?? '#FFD93D', seed.bg, 3),
    line: alpha(text, dark ? 0.12 : 0.1),
    scrim: dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)',
  };
};

export type ThemeOverrides = Omit<Partial<Theme>, 'colors' | 'fonts'> & {colors: ColorSeed; fonts?: Partial<Theme['fonts']>};

const base = (overrides: ThemeOverrides): Theme => {
  const colors = deriveColors(overrides.colors);
  return {
    ...theme,
    ...overrides,
    colors,
    fonts: {...theme.fonts, ...(overrides.fonts ?? {})},
    shadow: {card: isDark(colors.bg) ? '0 30px 80px rgba(0,0,0,0.45)' : '0 20px 60px rgba(20,20,20,0.12)', text: textShadowFor(colors.bg)},
  };
};

const BUILT_IN_STYLES: Record<string, StylePreset> = {
  'midnight-neon': {
    id: 'midnight-neon',
    label: 'Midnight Neon',
    concept: 'Near-black stage, one electric violet accent as light, condensed uppercase hits. Tech, gaming, bold opinions.',
    theme: base({colors: {bg: '#0A0A10', accent: '#8B5CF6', highlight: '#F5D90A'}, fonts: {display: FONT_FAMILIES.montserrat, impact: FONT_FAMILIES.anton, caption: FONT_FAMILIES.montserrat}, uppercase: true}),
    captionStyle: 'hormozi',
    grade: 'neon-night',
    background: 'spotlight',
    dataBackground: 'dots',
    pacing: 'fast',
    thumbnail: {font: FONT_FAMILIES.anton, textCase: 'upper', accentBlock: true},
  },
  'clean-corporate': {
    id: 'clean-corporate',
    label: 'Clean Corporate',
    concept: 'Deep navy field, cyan accent, generous whitespace, Poppins. Explainers, SaaS, finance, B2B.',
    theme: base({colors: {bg: '#0B1B33', accent: '#22D3EE', highlight: '#FDE047'}, fonts: {display: FONT_FAMILIES.poppins, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.poppins, impact: FONT_FAMILIES.poppins}}),
    captionStyle: 'boxed',
    grade: 'none',
    background: 'tonal',
    dataBackground: 'dots',
    pacing: 'medium',
    thumbnail: {font: FONT_FAMILIES.poppins, textCase: 'none', accentBlock: true},
  },
  'hype-bold': {
    id: 'hype-bold',
    label: 'Hype Bold',
    concept: 'Black, one hot orange accent, Anton slams, speed lines. Sports, drops, challenges, motivation.',
    theme: base({colors: {bg: '#0C0C0C', accent: '#FF6B1A', highlight: '#FFD60A'}, fonts: {display: FONT_FAMILIES.anton, caption: FONT_FAMILIES.montserrat, impact: FONT_FAMILIES.anton}, uppercase: true}),
    captionStyle: 'outline',
    grade: 'vibrant-pop',
    background: 'streaks',
    dataBackground: 'solid',
    pacing: 'fast',
    thumbnail: {font: FONT_FAMILIES.anton, textCase: 'upper', accentBlock: true},
  },
  'luxury-noir': {
    id: 'luxury-noir',
    label: 'Luxury Noir',
    concept: 'Near-black, champagne gold, Playfair headlines, slow moves. Real estate, jewellery, premium brands.',
    theme: base({colors: {bg: '#0B0B0B', accent: '#D4AF6A', highlight: '#EBD9A8', text: '#F3EEE6'}, fonts: {display: FONT_FAMILIES.playfair, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.inter, impact: FONT_FAMILIES.playfair}, grade: 'contrast(1.06) saturate(0.85)'}),
    captionStyle: 'minimal',
    grade: 'cool-noir',
    background: 'rays',
    dataBackground: 'solid',
    pacing: 'calm',
    thumbnail: {font: FONT_FAMILIES.playfair, textCase: 'none', accentBlock: false},
  },
  'warm-editorial': {
    id: 'warm-editorial',
    label: 'Warm Editorial',
    concept: 'Warm charcoal field, terracotta accent, serif headlines, paper feel. Storytelling, education, lifestyle.',
    theme: base({colors: {bg: '#1D1714', accent: '#E07A3F', highlight: '#F2C14E', text: '#F7EFE4'}, fonts: {display: FONT_FAMILIES.playfair, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.montserrat, impact: FONT_FAMILIES.montserrat}}),
    captionStyle: 'karaoke',
    grade: 'warm-film',
    background: 'waves',
    dataBackground: 'paper',
    pacing: 'medium',
    thumbnail: {font: FONT_FAMILIES.playfair, textCase: 'none', accentBlock: true},
  },
  'tech-grid': {
    id: 'tech-grid',
    label: 'Tech Grid',
    concept: 'Graphite with one electric green accent, Space Grotesk, perspective grid. AI, dev tools, product demos.',
    theme: base({colors: {bg: '#0B0F0E', accent: '#22C55E', highlight: '#A3E635'}, fonts: {display: FONT_FAMILIES.spaceGrotesk, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.spaceGrotesk, impact: FONT_FAMILIES.spaceGrotesk}}),
    captionStyle: 'pop',
    grade: 'none',
    background: 'grid',
    dataBackground: 'particles',
    pacing: 'fast',
    thumbnail: {font: FONT_FAMILIES.spaceGrotesk, textCase: 'upper', accentBlock: true},
  },
  'paper-light': {
    id: 'paper-light',
    label: 'Paper Light',
    concept: 'Warm off-white paper, near-black type, one signal-red accent. Education, productivity, newsletters, daytime brands.',
    theme: base({colors: {bg: '#F4F1EA', accent: '#D6453D', highlight: '#B7791F'}, fonts: {display: FONT_FAMILIES.poppins, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.poppins, impact: FONT_FAMILIES.anton}, grade: 'contrast(1.02) saturate(0.95)'}),
    captionStyle: 'boxed',
    grade: 'none',
    background: 'paper',
    dataBackground: 'solid',
    pacing: 'medium',
    thumbnail: {font: FONT_FAMILIES.poppins, textCase: 'none', accentBlock: true},
  },
};

/** What src/lib/brand-styles.ts receives to build channel presets without importing this file at runtime. */
export type BrandStyleHelpers = {readonly base: (overrides: ThemeOverrides) => Theme; readonly FONT_FAMILIES: typeof FONT_FAMILIES};

/** Built-in presets plus the project's own (src/lib/brand-styles.ts, never overwritten by scaffold --update). */
export const STYLES: Record<string, StylePreset> = {...BUILT_IN_STYLES, ...brandStyles({base, FONT_FAMILIES})};

export const STYLE_IDS = Object.keys(STYLES);
export const DEFAULT_STYLE = 'midnight-neon';

export const getStyle = (id?: string | null): StylePreset => STYLES[id ?? ''] ?? STYLES[DEFAULT_STYLE];

/** Apply per-video overrides (accent color from props, etc.) on top of a preset's theme, re-deriving dependent roles. */
export const themeWith = (preset: StylePreset, overrides: {accent?: string | null; bg?: string | null}): Theme => {
  if (!overrides.accent && !overrides.bg) return preset.theme;
  const c = preset.theme.colors;
  const colors = deriveColors({bg: overrides.bg ?? c.bg, accent: overrides.accent ?? c.accent, highlight: c.highlight, text: overrides.bg ? undefined : c.text});
  return {...preset.theme, colors, shadow: {...preset.theme.shadow, text: textShadowFor(colors.bg)}};
};
