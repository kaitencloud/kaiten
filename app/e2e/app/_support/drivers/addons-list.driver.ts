import { expect, type Locator, type Page } from '@playwright/test';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The catalogue of add-ons: every family with its versions, to search, to list in the
 * public catalogue, and to move along their lifecycle from the table. A new family or
 * version is made in a dialog the URL opens (`AddonFormDriver`), and a version is read on
 * its own page (`AddonDetailDriver`).
 */
export class AddonsListDriver {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/addons');
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: 'Add-ons', level: 1 }),
    ).toBeVisible();
  }

  /** The call to make a new family: a link, since the dialog it opens is in the URL. */
  newAddon(): Locator {
    return this.page
      .getByRole('link', { exact: true, name: 'New add-on' })
      .first();
  }

  searchField(): Locator {
    return this.page.getByPlaceholder('Add-on name');
  }

  empty(): Locator {
    return this.page.getByTestId('addons-empty');
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

  /** The switch that lists a family in the public catalogue, or takes it out. */
  publicSwitch(name: string): Locator {
    return this.family(name).getByRole('switch', {
      name: `List ${name} in the public catalogue`,
    });
  }

  /** What a family says of itself when it is listed in the public catalogue. */
  publicBadge(name: string): Locator {
    return this.family(name).getByText('Public', { exact: true });
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

  /** What can be done to a version from its row: publish, archive, set as default, delete... */
  action(familyName: string, versionName: string, label: string): Locator {
    return this.versionRow(familyName, versionName).getByRole('button', {
      exact: true,
      name: label,
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

  async openVersion(familyName: string, versionName: string) {
    await this.versionRow(familyName, versionName)
      .getByRole('link', { name: versionName, exact: true })
      .click();
  }
}
