import {
  createCollection,
  localStorageCollectionOptions,
} from '@tanstack/react-db';
import { z } from 'zod';

export const APP_SETTINGS_ID = 'app';
export const APP_SETTINGS_STORAGE_KEY = 'kaiten:app-settings';
const LEGACY_APP_SETTINGS_STORAGE_KEY = 'kaiten:app-preferences';
const APP_SETTINGS_STORAGE_RECORD_KEY = `s:${APP_SETTINGS_ID}`;
const LEGACY_THEME_STORAGE_KEYS = ['ui-theme', 'theme'] as const;
const LEGACY_LANGUAGE_STORAGE_KEY = 'language';

export const APP_DEFAULT_LANGUAGE = 'en';
export const APP_DEFAULT_THEME = 'dark';

export const appThemeSchema = z.enum(['dark', 'light']);

const storedAppSettingsSchema = z.object({
  id: z.literal(APP_SETTINGS_ID),
  sideNavExpanded: z.boolean(),
  theme: appThemeSchema.optional(),
  language: z.string().min(1).optional(),
});

export const appSettingsSchema = z.object({
  id: z.literal(APP_SETTINGS_ID),
  sideNavExpanded: z.boolean(),
  theme: appThemeSchema,
  language: z.string().min(1),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type AppTheme = z.infer<typeof appThemeSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: APP_SETTINGS_ID,
  sideNavExpanded: true,
  theme: APP_DEFAULT_THEME,
  language: APP_DEFAULT_LANGUAGE,
};

export const appSettingsCollection = createCollection(
  localStorageCollectionOptions({
    id: 'app-settings',
    storageKey: APP_SETTINGS_STORAGE_KEY,
    schema: appSettingsSchema,
    getKey: (item) => item.id,
  }),
);

void appSettingsCollection.preload();

function readLegacyThemeSetting() {
  if (typeof window === 'undefined') {
    return null;
  }

  for (const storageKey of LEGACY_THEME_STORAGE_KEYS) {
    const value = window.localStorage.getItem(storageKey);
    const parsedTheme = appThemeSchema.safeParse(value);

    if (parsedTheme.success) {
      return parsedTheme.data;
    }
  }

  return null;
}

function readLegacyLanguageSetting() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedLanguage = window.localStorage.getItem(
    LEGACY_LANGUAGE_STORAGE_KEY,
  );

  if (!storedLanguage || storedLanguage.trim().length === 0) {
    return null;
  }

  return storedLanguage;
}

function clearLegacyPreferenceSettings() {
  if (typeof window === 'undefined') {
    return;
  }

  for (const storageKey of LEGACY_THEME_STORAGE_KEYS) {
    window.localStorage.removeItem(storageKey);
  }

  window.localStorage.removeItem(LEGACY_LANGUAGE_STORAGE_KEY);
}

function normalizeAppSettings(
  settings: z.infer<typeof storedAppSettingsSchema>,
): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...settings,
    theme: settings.theme ?? readLegacyThemeSetting() ?? APP_DEFAULT_THEME,
    language:
      settings.language ?? readLegacyLanguageSetting() ?? APP_DEFAULT_LANGUAGE,
  };
}

function getFallbackAppSettings() {
  return normalizeAppSettings({
    id: APP_SETTINGS_ID,
    sideNavExpanded: DEFAULT_APP_SETTINGS.sideNavExpanded,
  });
}

function readStoredAppSettings(storageKey: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedSettings = window.localStorage.getItem(storageKey);

  if (!storedSettings) {
    return null;
  }

  try {
    const parsedStorage = JSON.parse(storedSettings) as Record<
      string,
      { data?: unknown }
    >;
    const parsedSettings = storedAppSettingsSchema.safeParse(
      parsedStorage[APP_SETTINGS_STORAGE_RECORD_KEY]?.data,
    );

    return parsedSettings.success
      ? normalizeAppSettings(parsedSettings.data)
      : null;
  } catch {
    return null;
  }
}

function migrateLegacyAppSettings() {
  const legacySettings = readStoredAppSettings(LEGACY_APP_SETTINGS_STORAGE_KEY);

  if (!legacySettings) {
    return null;
  }

  appSettingsCollection.insert(legacySettings);
  window.localStorage.removeItem(LEGACY_APP_SETTINGS_STORAGE_KEY);

  return legacySettings;
}

export function getAppSettingsSnapshot() {
  return (
    appSettingsCollection.get(APP_SETTINGS_ID) ??
    readStoredAppSettings(APP_SETTINGS_STORAGE_KEY) ??
    readStoredAppSettings(LEGACY_APP_SETTINGS_STORAGE_KEY) ??
    getFallbackAppSettings()
  );
}

function normalizeAppSettingsDraft(draft: AppSettings) {
  const themeResult = appThemeSchema.safeParse(draft.theme);
  if (!themeResult.success) {
    draft.theme = APP_DEFAULT_THEME;
  }
  if (
    typeof draft.language !== 'string' ||
    draft.language.trim().length === 0
  ) {
    draft.language = APP_DEFAULT_LANGUAGE;
  }
}

export function ensureAppSettings() {
  const existingSettings = appSettingsCollection.get(APP_SETTINGS_ID);

  if (existingSettings) {
    clearLegacyPreferenceSettings();
    return existingSettings;
  }

  const storedSettings = readStoredAppSettings(APP_SETTINGS_STORAGE_KEY);

  if (storedSettings) {
    appSettingsCollection.insert(storedSettings);
    clearLegacyPreferenceSettings();
    return storedSettings;
  }

  const migratedSettings = migrateLegacyAppSettings();

  if (migratedSettings) {
    clearLegacyPreferenceSettings();
    return migratedSettings;
  }

  const nextDefaultSettings = getFallbackAppSettings();

  appSettingsCollection.insert(nextDefaultSettings);
  clearLegacyPreferenceSettings();

  return nextDefaultSettings;
}

export function updateAppSettings(update: (draft: AppSettings) => void) {
  if (!appSettingsCollection.has(APP_SETTINGS_ID)) {
    const nextSettings = { ...ensureAppSettings() };
    normalizeAppSettingsDraft(nextSettings);
    update(nextSettings);
    normalizeAppSettingsDraft(nextSettings);
    appSettingsCollection.insert(nextSettings);
    return;
  }

  appSettingsCollection.update(APP_SETTINGS_ID, (draft) => {
    update(draft);
    normalizeAppSettingsDraft(draft);
  });
}

export function setSideNavExpandedSetting(sideNavExpanded: boolean) {
  updateAppSettings((draft) => {
    draft.sideNavExpanded = sideNavExpanded;
  });
}

export function setThemeSetting(theme: AppTheme) {
  updateAppSettings((draft) => {
    draft.theme = theme;
  });
}

export function setLanguageSetting(language: string) {
  updateAppSettings((draft) => {
    draft.language = language;
  });
}

export function resetAppSettings() {
  if (!appSettingsCollection.has(APP_SETTINGS_ID)) {
    appSettingsCollection.insert(DEFAULT_APP_SETTINGS);
    return;
  }

  appSettingsCollection.update(APP_SETTINGS_ID, (draft) => {
    draft.sideNavExpanded = DEFAULT_APP_SETTINGS.sideNavExpanded;
    draft.theme = DEFAULT_APP_SETTINGS.theme;
    draft.language = DEFAULT_APP_SETTINGS.language;
  });
}
