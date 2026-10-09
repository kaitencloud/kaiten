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

  /** The switch that lists a family in the public catalogue, or takes it out. */
  publicSwitch(name: string): Locator {
    return this.family(name).getByRole('switch', {
      name: `List ${name} in the public catalogue`,
    });
  }

  /** How the version a family is shown under is sold: its prices, or that it is free or on request. */
  priceSummary(name: string): Locator {
    return this.family(name).getByTestId('license-price-summary');
  }

  /** What a family says of itself when it is listed in the public catalogue. */
  publicBadge(name: string): Locator {
    return this.family(name).getByText('Public', { exact: true });
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

  /** A column of a family's versions table, by its header. */
  columnHeader(familyName: string, column: string): Locator {
    return this.family(familyName).getByRole('columnheader', {
      name: column,
      exact: true,
    });
  }

  /** What one version's row shows under a column of the table. */
  async versionCell(
    familyName: string,
    versionName: string,
    column: string,
  ): Promise<Locator> {
    const headers = (
      await this.family(familyName).getByRole('columnheader').allInnerTexts()
    ).map((text) => text.trim());
    const index = headers.indexOf(column);
    expect(
      index,
      `a "${column}" column in ${headers.join(', ')}`,
    ).toBeGreaterThan(-1);

    return this.versionRow(familyName, versionName)
      .getByRole('cell')
      .nth(index);
  }
}
