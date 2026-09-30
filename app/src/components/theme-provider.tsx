import { createContext, type ReactNode, use, useEffect } from 'react';
import { useAppSettings } from '@/hooks/use-app-settings';
import type { AppTheme } from '@/lib/settings';

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: AppTheme;
};

type ThemeProviderState = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};
const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined,
);

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  ...props
}: ThemeProviderProps) {
  const {
    settings: { theme: storedTheme },
    setTheme,
  } = useAppSettings();
  const theme = storedTheme ?? defaultTheme;

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'dark') {
      root.classList.add('dark');
      return;
    }

    root.classList.add('light');
  }, [theme]);

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = use(ThemeProviderContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
};
