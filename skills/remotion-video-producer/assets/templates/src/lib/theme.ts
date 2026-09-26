import React, {createContext, useContext} from 'react';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMontserrat} from '@remotion/google-fonts/Montserrat';
import {loadFont as loadAnton} from '@remotion/google-fonts/Anton';
import {loadFont as loadPoppins} from '@remotion/google-fonts/Poppins';
import {loadFont as loadSpaceGrotesk} from '@remotion/google-fonts/SpaceGrotesk';
import {loadFont as loadPlayfair} from '@remotion/google-fonts/PlayfairDisplay';

/**
 * Design tokens with per-video style presets.
 *
 * `theme` is the default token set. `<StyleProvider preset="...">` (used by SocialVideo and the
 * Thumbnail) swaps colors, fonts, caption style, grade and background for a whole video, and
 * every component reads tokens through `useTheme()` so one script field (`"style"`) restyles
 * the entire cut consistently. Presets live in src/lib/styles.ts.
 *
 * Fonts (all Google Fonts, free for commercial use) are loaded once at module init:
 *  Inter (neutral), Montserrat 900 (Hormozi captions, hooks), Anton (condensed hits),
 *  Poppins (friendly bold), Space Grotesk (tech), Playfair Display (editorial / luxury).
 */
const inter = loadInter('normal', {weights: ['400', '500', '700', '900'], subsets: ['latin']});
const montserrat = loadMontserrat('normal', {weights: ['700', '800', '900'], subsets: ['latin']});
const anton = loadAnton('normal', {weights: ['400'], subsets: ['latin']});
const poppins = loadPoppins('normal', {weights: ['500', '700', '800'], subsets: ['latin']});
const spaceGrotesk = loadSpaceGrotesk('normal', {weights: ['500', '700'], subsets: ['latin']});
const playfair = loadPlayfair('normal', {weights: ['700', '900'], subsets: ['latin']});

export const FONT_FAMILIES = {
  inter: inter.fontFamily,
  montserrat: montserrat.fontFamily,
  anton: anton.fontFamily,
  poppins: poppins.fontFamily,
  spaceGrotesk: spaceGrotesk.fontFamily,
  playfair: playfair.fontFamily,
} as const;
export type FontKey = keyof typeof FONT_FAMILIES;

/** Resolves when all fonts are ready; await before measuring text. */
export const fontsReady = () => Promise.all([inter.waitUntilDone(), montserrat.waitUntilDone(), anton.waitUntilDone(), poppins.waitUntilDone(), spaceGrotesk.waitUntilDone(), playfair.waitUntilDone()]);

export type ThemeColors = {
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly accent2: string;
  /** Caption highlight (Hormozi yellow by default). */
  readonly highlight: string;
  readonly scrim: string;
};

export type Theme = {
  readonly colors: ThemeColors;
  readonly fonts: {readonly display: string; readonly body: string; readonly caption: string; readonly impact: string};
  readonly radius: {readonly sm: number; readonly md: number; readonly lg: number};
  readonly shadow: {readonly card: string; readonly text: string};
  /** CSS filter applied to external footage and photos so mixed sources look like one shoot. */
  readonly grade: string;
  /** Uppercase headlines and captions. */
  readonly uppercase: boolean;
};

export const theme: Theme = {
  colors: {
    bg: '#0B0B0F',
    surface: '#15151C',
    text: '#F5F5F7',
    muted: 'rgba(245,245,247,0.64)',
    accent: '#7C5CFF',
    accent2: '#22D3EE',
    highlight: '#FFD93D',
    scrim: 'rgba(0,0,0,0.55)',
  },
  fonts: {
    display: FONT_FAMILIES.inter,
    body: FONT_FAMILIES.inter,
    caption: FONT_FAMILIES.montserrat,
    impact: FONT_FAMILIES.anton,
  },
  radius: {sm: 12, md: 24, lg: 40},
  shadow: {
    card: '0 30px 80px rgba(0,0,0,0.45)',
    text: '0 2px 12px rgba(0,0,0,0.5)',
  },
  grade: 'contrast(1.05) saturate(0.92)',
  uppercase: false,
};

const ThemeContext = createContext<Theme>(theme);

/** Provide a resolved theme (from a style preset) to everything below. */
export const ThemeProvider: React.FC<{readonly value: Theme; readonly children: React.ReactNode}> = ({value, children}) => React.createElement(ThemeContext.Provider, {value}, children);

/** Read the active theme. Falls back to the default tokens outside a provider. */
export const useTheme = (): Theme => useContext(ThemeContext);
