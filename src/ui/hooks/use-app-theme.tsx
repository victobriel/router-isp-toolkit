import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export enum AppThemePreference {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}
export const THEME_STORAGE_KEY = 'app_theme';
export enum EffectiveTheme {
  LIGHT = 'light',
  DARK = 'dark',
}

interface AppThemeContextValue {
  themePreference: AppThemePreference;
  setThemePreference: (theme: AppThemePreference) => void;
  effectiveTheme: EffectiveTheme;
}

const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used within an AppThemeProvider');
  }
  return value;
}

interface AppThemeProviderProps {
  children: ReactNode;
  persistPreference?: boolean;
}

export function AppThemeProvider({ children, persistPreference = false }: AppThemeProviderProps) {
  const [themePreference, setThemePreference] = useState<AppThemePreference>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (!stored) {
      return AppThemePreference.SYSTEM;
    }

    const theme = {
      [AppThemePreference.LIGHT]: AppThemePreference.LIGHT,
      [AppThemePreference.DARK]: AppThemePreference.DARK,
      [AppThemePreference.SYSTEM]: AppThemePreference.SYSTEM,
    };
    if (!(stored in theme)) {
      return AppThemePreference.SYSTEM;
    }
    return theme[stored as AppThemePreference];
  });

  const effectiveTheme = useMemo((): EffectiveTheme => {
    if (themePreference === AppThemePreference.SYSTEM) {
      // Extensions always run in a browser environment, but keep this safe for tests.
      const mql =
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(prefers-color-scheme: dark)')
          : null;
      return mql?.matches ? EffectiveTheme.DARK : EffectiveTheme.LIGHT;
    }

    return themePreference === AppThemePreference.DARK ? EffectiveTheme.DARK : EffectiveTheme.LIGHT;
  }, [themePreference]);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === EffectiveTheme.DARK);
    if (persistPreference) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, themePreference);
      } catch {
        // Ignore storage failures; DOM class still reflects the choice.
      }
    }
  }, [themePreference, persistPreference, effectiveTheme]);

  const value = useMemo(
    () => ({ themePreference, setThemePreference, effectiveTheme }),
    [themePreference, effectiveTheme],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}
