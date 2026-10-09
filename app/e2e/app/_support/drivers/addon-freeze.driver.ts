import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The dialog a change to an add-on version that cannot be changed any more opens: what
 * the API said and the way to a new version.
 */
export class AddonFreezeDriver {
  constructor(private readonly page: Page) {}

  dialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  /** What the API said, as it said it. */
  detail(): Locator {
    return this.dialog().getByRole('note');
  }

  createNewVersion(): Locator {
    return this.dialog().getByRole('link', { name: 'Create a new version' });
  }

  async expectTitle(title: string) {
    await expect(
      this.dialog().getByRole('heading', { name: title }),
    ).toBeVisible();
  }
}
