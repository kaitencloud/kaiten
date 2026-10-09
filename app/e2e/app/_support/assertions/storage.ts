import type { Page } from '@playwright/test';

/**
 * What the console keeps in the storage of the browser, as text to search: the local and
 * the session storage, without the entries that are the state of the mocked API. The suite
 * keeps that state in the same storage (`__KAITEN_E2E_MSW__` holds every code a spec
 * redeems), so it says nothing of what the console itself stores.
 */
export async function readConsoleStorage(page: Page): Promise<string> {
  return page.evaluate(() =>
    JSON.stringify(
      [window.localStorage, window.sessionStorage].flatMap((storage) =>
        Object.keys(storage)
          .filter((key) => !key.startsWith('__KAITEN_E2E'))
          .map((key) => [key, storage.getItem(key)]),
      ),
    ),
  );
}
