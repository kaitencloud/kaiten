import { expect, type Locator, type Page } from '@playwright/test';

/** The Compatible licenses tab of an add-on version: a box for each license family. */
export class AddonCompatibilityDriver {
  constructor(private readonly page: Page) {}

  async goto(slug: string, title: string) {
    await this.page.goto(`/addons/${slug}/compatibility`);
    await expect(
      this.page.getByRole('heading', { name: title, level: 1 }),
    ).toBeVisible();
    await expect(this.families()).toBeVisible();
  }

  families(): Locator {
    return this.page.getByRole('list', { name: 'License families' });
  }

  /** The box of a family, by the name it is shown under. */
  box(name: RegExp | string): Locator {
    return this.families().getByRole('checkbox', { name });
  }

  /** What is said of a version that fits no family: it is attachable to nothing. */
  emptyWarning(): Locator {
    return this.page.getByTestId('compatibility-empty');
  }
}
