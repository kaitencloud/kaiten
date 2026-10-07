import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A dialog traps the focus: the tab order is a loop, so that however many times
 * the person tabs, forward or back, the focus stays inside it and never reaches
 * the page the dialog covers.
 */
export async function expectFocusTrapped(page: Page, dialog: Locator) {
  const hasFocus = () =>
    dialog.evaluate((node) => node.matches(':focus-within'));

  await expect.poll(hasFocus).toBe(true);
  for (const key of ['Tab', 'Shift+Tab']) {
    // More presses than any of the dialogs has fields: the loop is walked whole.
    for (let step = 0; step < 24; step += 1) {
      await page.keyboard.press(key);
      // Past the last field the focus rests on a guard for a frame, and is sent
      // back round to the first: it is inside again once that frame has run.
      await expect
        .poll(hasFocus, { message: `${key} press ${step + 1}` })
        .toBe(true);
    }
  }
}
