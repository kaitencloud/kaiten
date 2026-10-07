import type { Page } from '@playwright/test';

const APP_SETTINGS_STORAGE_KEY = 'kaiten:app-settings';

/** The settings the console stores, with the language it reads at startup. */
const appSettings = (language: string) => ({
  's:app': {
    data: {
      id: 'app',
      language,
      sideNavExpanded: true,
      theme: 'dark',
    },
    versionKey: 'e2e-language',
  },
});

/**
 * Stores the language the console reads at startup. The page must already be
 * on the app's origin, so call it after a `goto` and reload to apply it, and
 * assert before you navigate again: see `startInLanguage` for a spec that
 * goes on to navigate.
 */
export async function persistLanguage(page: Page, language: string) {
  await page.evaluate(
    ({ storageKey, settings }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
    },
    { settings: appSettings(language), storageKey: APP_SETTINGS_STORAGE_KEY },
  );
}

/**
 * Makes every page the test loads start in `language`, with no reload: the
 * setting is written before the scripts of the page run, on each load. It is the
 * one for a spec that goes on to navigate. The first load of a page under Mock
 * Service Worker reloads once on its own, and a `page.reload()` after
 * `persistLanguage` races that reload: a `page.goto` that follows is sometimes
 * interrupted by it. Call it before the first `goto`, and wait for something the
 * console draws before the next one, so that the reload has happened.
 */
export async function startInLanguage(page: Page, language: string) {
  await page.addInitScript(
    ({ storageKey, settings }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
    },
    { settings: appSettings(language), storageKey: APP_SETTINGS_STORAGE_KEY },
  );
}
