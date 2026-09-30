import { addons } from 'storybook/manager-api';
import { darkTheme, lightTheme } from './theme';

// Apply dark theme by default
addons.setConfig({
  theme: darkTheme,
});

// Listen to theme changes and update Storybook UI accordingly
const STORAGE_KEY = 'sb-addon-themes-3';

function updateStorybookTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { theme } = JSON.parse(stored);
      addons.setConfig({
        theme: theme === 'light' ? lightTheme : darkTheme,
      });
    }
  } catch {
    // Ignore errors when updating theme
  }
}

// Update on load
updateStorybookTheme();

// Listen for storage changes (when theme toggle is clicked)
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) {
    updateStorybookTheme();
  }
});

// Poll for changes (fallback for same-tab updates)
let lastTheme: string | null = null;
setInterval(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { theme } = JSON.parse(stored);
      if (theme !== lastTheme) {
        lastTheme = theme;
        addons.setConfig({
          theme: theme === 'light' ? lightTheme : darkTheme,
        });
      }
    }
  } catch {
    // Ignore errors in polling
  }
}, 100);
