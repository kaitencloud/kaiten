import { create } from 'storybook/theming';

// Kaiten Dark Theme (custom theme matching your app)
export const darkTheme = create({
  base: 'dark',

  // Brand
  brandTitle: 'Kaiten',
  brandUrl: '/',
  brandTarget: '_self',

  // UI colors matching your app's dark theme
  colorPrimary: '#7c3aed', // --primary
  colorSecondary: '#7c3aed', // --primary

  // UI
  appBg: '#0a0a0b', // --background
  appContentBg: '#0a0a0b', // --card
  appBorderColor: '#262626', // --border
  appBorderRadius: 12, // --radius (0.75rem = 12px)

  // Text colors
  textColor: '#f7f7f7', // --foreground
  textInverseColor: '#0a0a0b',
  textMutedColor: '#a6a6a6', // --muted-foreground

  // Toolbar default and active colors
  barTextColor: '#a6a6a6',
  barSelectedColor: '#7c3aed',
  barBg: '#0a0a0b',

  // Form colors
  inputBg: '#262626', // --input
  inputBorder: '#262626',
  inputTextColor: '#f7f7f7',
  inputBorderRadius: 8,

  // Font
  fontBase: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  fontCode: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
});

// Kaiten Light Theme
export const lightTheme = create({
  base: 'light',

  // Brand
  brandTitle: 'Kaiten Feature Flags',
  brandUrl: '/',
  brandTarget: '_self',

  // UI colors matching your app's light theme
  colorPrimary: '#7c3aed', // --primary
  colorSecondary: '#7c3aed', // --primary

  // UI
  appBg: '#ffffff', // --background
  appContentBg: '#ffffff', // --card
  appBorderColor: '#e2e8f0', // --border
  appBorderRadius: 12, // --radius (0.75rem = 12px)

  // Text colors
  textColor: '#0a0a0b', // --foreground
  textInverseColor: '#f7f7f7',
  textMutedColor: '#64748b', // --muted-foreground

  // Toolbar default and active colors
  barTextColor: '#64748b',
  barSelectedColor: '#7c3aed',
  barBg: '#ffffff',

  // Form colors
  inputBg: '#f1f5f9', // --input
  inputBorder: '#e2e8f0',
  inputTextColor: '#0a0a0b',
  inputBorderRadius: 8,

  // Font
  fontBase: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  fontCode: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
});
