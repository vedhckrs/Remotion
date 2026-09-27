import type {BrandStyleHelpers, StylePreset} from './styles';

/**
 * Your channel's own style presets. `scaffold.sh --update` never overwrites this file, so presets
 * added here survive skill upgrades. Each entry has the same shape as the built-in presets in
 * styles.ts; use it with `"style": "<id>"` in a script, `--style <id>` in the analyzer and autopilot,
 * or the dashboard's style picker.
 *
 * Example (a dark field with one yellow accent):
 *
 *   'my-brand': {
 *     id: 'my-brand',
 *     label: 'My Brand',
 *     concept: 'Ink field, one yellow accent, Space Grotesk.',
 *     theme: base({colors: {bg: '#0E1116', accent: '#FFD23F', highlight: '#FFD23F', text: '#FFFFFF'}, fonts: {display: FONT_FAMILIES.spaceGrotesk, body: FONT_FAMILIES.inter, caption: FONT_FAMILIES.spaceGrotesk, impact: FONT_FAMILIES.spaceGrotesk}}),
 *     captionStyle: 'pop',
 *     grade: 'none',
 *     background: 'grid',
 *     dataBackground: 'dots',
 *     pacing: 'medium',
 *     thumbnail: {font: FONT_FAMILIES.spaceGrotesk, textCase: 'upper', accentBlock: true},
 *   },
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const brandStyles = ({base, FONT_FAMILIES}: BrandStyleHelpers): Record<string, StylePreset> => ({});
