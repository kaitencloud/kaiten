import { expect, type Page } from '@playwright/test';

export async function expectToast(page: Page, message: string) {
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: message }).first(),
  ).toBeVisible();
}

/** Asserts that no toast is on screen: nothing was reported to the person. */
export async function expectNoToast(page: Page) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
}

/**
 * Asserts that an error toast (data-type="error") is visible.
 * Without a message it does not check the text — useful when the exact error
 * message is controlled by a third-party (e.g. Axios) and could change without
 * notice. With one, the toast that says it is the one asserted: for a refusal of
 * the API, whose words the screen shows as they were written.
 */
export async function expectErrorToast(page: Page, message?: string) {
  const errors = page.locator('[data-sonner-toast][data-type="error"]');

  await expect(
    (message === undefined
      ? errors
      : errors.filter({ hasText: message })
    ).first(),
  ).toBeVisible();
}

/**
 * Asserts that the page's primary `<h1>` heading is visible with the given title.
 * Replaces the repeated pattern: `expect(page.getByRole('heading', { name })).toBeVisible()`
 */
export async function expectPageHeading(page: Page, title: string) {
  await expect(
    page.getByRole('heading', { name: title, level: 1 }),
  ).toBeVisible();
}

/**
 * Asserts that a confirmation alertdialog is currently open.
 * Used in delete-flow tests after clicking the Delete button.
 */
export async function expectAlertDialog(page: Page) {
  await expect(page.getByRole('alertdialog')).toBeVisible();
}

/**
 * Asserts that no open dialog is present on the page.
 * Useful to verify that a form dialog closed after a successful submit.
 */
export async function expectDialogClosed(page: Page) {
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Asserts that an empty-state message is visible somewhere on the page.
 * @param message - The text of the empty state (e.g. 'No results', 'No evaluations yet.')
 */
export async function expectEmptyState(page: Page, message: string) {
  await expect(page.getByText(message).first()).toBeVisible();
}
