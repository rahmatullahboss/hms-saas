import { baseCSS } from './base';
import { getArogyasevaCSS } from './arogyaseva';
import { getMedtrustCSS } from './medtrust';
import { getCarefirstCSS } from './carefirst';

export type ThemeName = 'arogyaseva' | 'medtrust' | 'carefirst';

interface ThemeOverrides {
  primary?: string;
  secondary?: string;
}

const themeMap: Record<ThemeName, (overrides?: ThemeOverrides) => string> = {
  arogyaseva: getArogyasevaCSS,
  medtrust: getMedtrustCSS,
  carefirst: getCarefirstCSS,
};

/**
 * Returns full CSS string for a given theme (base + theme-specific).
 */
export function getFullThemeCSS(
  theme: ThemeName = 'arogyaseva',
  overrides?: ThemeOverrides
): string {
  const themeFn = themeMap[theme] || themeMap.arogyaseva;
  return baseCSS + themeFn(overrides);
}
