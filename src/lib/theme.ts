export const THEME_STORAGE_KEY = 'md-serve-theme' as const;

export const themes = {
  light: 'light',
  dark: 'dark',
  system: 'system',
} as const;

export type Theme = (typeof themes)[keyof typeof themes];

export const themeConfig = {
  attribute: 'class',
  defaultTheme: 'system' as Theme,
  storageKey: THEME_STORAGE_KEY,
  enableSystem: true,
  disableTransitionOnChange: false,
} as const;
