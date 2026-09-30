import { eq, useLiveQuery } from '@tanstack/react-db';
import { useEffect } from 'react';
import {
  APP_SETTINGS_ID,
  appSettingsCollection,
  ensureAppSettings,
  getAppSettingsSnapshot,
  resetAppSettings,
  setLanguageSetting,
  setSideNavExpandedSetting,
  setThemeSetting,
} from '@/lib/settings';

export function useAppSettings() {
  const { data: liveAppSettings } = useLiveQuery((query) =>
    query
      .from({ settings: appSettingsCollection })
      .where(({ settings }) => eq(settings.id, APP_SETTINGS_ID))
      .findOne(),
  );

  useEffect(() => {
    ensureAppSettings();
  }, []);

  void liveAppSettings;

  return {
    settings: getAppSettingsSnapshot(),
    resetAppSettings,
    setLanguage: setLanguageSetting,
    setSideNavExpanded: setSideNavExpandedSetting,
    setTheme: setThemeSetting,
  };
}
