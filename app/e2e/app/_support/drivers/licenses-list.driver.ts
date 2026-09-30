import { expect, type Locator, type Page } from '@playwright/test';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class LicensesListDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/licenses');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Licenses', level: 1 }),
    ).toBeVisible();
  }

  /** One family's accordion item, found by the name it is shown under. */
  family(name: string): Locator {
    return this.page
      .locator('[data-slot="accordion-item"]')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  private familyTrigger(name: string): Locator {
    return this.family(name).getByRole('button', {
      name: new RegExp(`^${escapeRegExp(name)}\\b`),
    });
  }

  /** Opens the family's versions table, unless it is already open. */
  async expandFamily(name: string) {
    const trigger = this.familyTrigger(name);
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }

  async startNewVersion(familyName: string) {
    await this.family(familyName)
      .getByRole('link', { name: 'New Version' })
      .click();
  }

  /** A version's row, found by its version name, which links to its page. */
  versionRow(familyName: string, versionName: string): Locator {
    return this.family(familyName)
      .getByRole('row')
      .filter({
        has: this.page.getByRole('link', { name: versionName, exact: true }),
      });
  }

  lifecycleAction(
    familyName: string,
    versionName: string,
    label: string,
  ): Locator {
    return this.versionRow(familyName, versionName).getByRole('button', {
      name: label,
      exact: true,
    });
  }

  async expectVersionState(
    familyName: string,
    versionName: string,
    state: string,
  ) {
    await expect(
      this.versionRow(familyName, versionName).getByText(state, {
        exact: true,
      }),
    ).toBeVisible();
  }
}
