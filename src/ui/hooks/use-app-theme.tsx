import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AppThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'app-theme';

type EffectiveTheme = 'light' | 'dark';

function getSystemTheme(): EffectiveTheme {
  // Extensions always run in a browser environment, but keep this safe for tests.
  const mql =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  return mql?.matches ? 'dark' : 'light';
}

function resolveEffectiveTheme(preference: AppThemePreference): EffectiveTheme {
  return preference === 'system' ? getSystemTheme() : preference;
}

function readStoredThemePreference(): AppThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function applyThemeToDom(preference: AppThemePreference) {
  const effective = resolveEffectiveTheme(preference);
  document.documentElement.classList.toggle('dark', effective === 'dark');
}

type AppThemeContextValue = {
  themePreference: AppThemePreference;
  setThemePreference: (theme: AppThemePreference) => void;
  effectiveTheme: EffectiveTheme;
};

const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined);

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) {
    throw new Error('useAppTheme must be used within an AppThemeProvider');
  }
  return value;
}

export function AppThemeProvider({
  children,
  persistPreference = false,
}: {
  children: ReactNode;
  persistPreference?: boolean;
}) {
  const [themePreference, setThemePreference] = useState<AppThemePreference>(() =>
    readStoredThemePreference(),
  );

  const effectiveTheme = useMemo(() => resolveEffectiveTheme(themePreference), [themePreference]);

  useLayoutEffect(() => {
    applyThemeToDom(themePreference);
    if (persistPreference) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, themePreference);
      } catch {
        // Ignore storage failures; DOM class still reflects the choice.
      }
    }
  }, [themePreference, persistPreference]);

  const value = useMemo(
    () => ({ themePreference, setThemePreference, effectiveTheme }),
    [themePreference, effectiveTheme],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}
