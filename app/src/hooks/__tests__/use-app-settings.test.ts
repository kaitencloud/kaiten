import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  APP_SETTINGS_ID,
  APP_SETTINGS_STORAGE_KEY,
  appSettingsCollection,
} from '@/lib/settings';
import { useAppSettings } from '../use-app-settings';

describe('useAppSettings', () => {
  beforeEach(async () => {
    if (appSettingsCollection.has(APP_SETTINGS_ID)) {
      await appSettingsCollection.delete(APP_SETTINGS_ID).isPersisted.promise;
    }

    localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
    localStorage.removeItem('kaiten:app-preferences');
    appSettingsCollection.utils.clearStorage();
  });

  it('returns the default app settings and seeds local storage', async () => {
    const { result } = renderHook(() => useAppSettings());

    expect(result.current.settings.sideNavExpanded).toBe(true);
    expect(result.current.settings.theme).toBe('dark');
    expect(result.current.settings.language).toBe('en');

    await waitFor(() => {
      expect(appSettingsCollection.get(APP_SETTINGS_ID)).toEqual(
        expect.objectContaining({
          id: APP_SETTINGS_ID,
          language: 'en',
          sideNavExpanded: true,
          theme: 'dark',
        }),
      );
    });

    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).toContain(
      APP_SETTINGS_ID,
    );
  });

  it('persists side-nav setting updates', async () => {
    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.settings.sideNavExpanded).toBe(true);
    });

    act(() => {
      result.current.setSideNavExpanded(false);
    });

    await waitFor(() => {
      expect(result.current.settings.sideNavExpanded).toBe(false);
    });

    await waitFor(() => {
      expect(appSettingsCollection.get(APP_SETTINGS_ID)).toEqual(
        expect.objectContaining({
          id: APP_SETTINGS_ID,
          language: 'en',
          sideNavExpanded: false,
          theme: 'dark',
        }),
      );
    });
  });

  it('resets app settings to their defaults', async () => {
    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.settings.sideNavExpanded).toBe(true);
    });

    act(() => {
      result.current.setSideNavExpanded(false);
    });

    await waitFor(() => {
      expect(result.current.settings.sideNavExpanded).toBe(false);
    });

    act(() => {
      result.current.resetAppSettings();
    });

    await waitFor(() => {
      expect(result.current.settings.sideNavExpanded).toBe(true);
    });
  });

  it('migrates a legacy stored setting before reseeding defaults', async () => {
    localStorage.setItem(
      'kaiten:app-preferences',
      JSON.stringify({
        's:app': {
          versionKey: 'existing-version',
          data: {
            id: APP_SETTINGS_ID,
            sideNavExpanded: false,
          },
        },
      }),
    );

    const { result } = renderHook(() => useAppSettings());

    await waitFor(() => {
      expect(result.current.settings.sideNavExpanded).toBe(false);
    });

    expect(localStorage.getItem('kaiten:app-preferences')).toBeNull();
  });
});
