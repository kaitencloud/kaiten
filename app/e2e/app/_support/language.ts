import type { Page } from '@playwright/test';

const APP_SETTINGS_STORAGE_KEY = 'kaiten:app-settings';

/**
 * Stores the language the console reads at startup. The page must already be
 * on the app's origin, so call it after a `goto` and reload to apply it.
 */
export async function persistLanguage(page: Page, language: string) {
  await page.evaluate(
    ({ storageKey, storedLanguage }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          's:app': {
            data: {
              id: 'app',
              language: storedLanguage,
              sideNavExpanded: true,
              theme: 'dark',
            },
            versionKey: 'e2e-language',
          },
        }),
      );
    },
    { storageKey: APP_SETTINGS_STORAGE_KEY, storedLanguage: language },
  );
}
