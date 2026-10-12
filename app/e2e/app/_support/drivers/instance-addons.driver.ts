import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The add-ons of an instance, on its Billing tab: the card that lists what it holds,
 * the quantity of each stepped one unit at a time, the confirmation that takes one off,
 * the dialog that adds one, and the field of the subscribe dialog that starts a
 * subscription with some. The tab itself is `InstanceBillingDriver`'s.
 */
export class InstanceAddonsDriver {
  constructor(private readonly page: Page) {}

  card(): Locator {
    return this.page.getByTestId('instance-addons');
  }

  empty(): Locator {
    return this.page.getByTestId('instance-addons-empty');
  }

  /** What the card says of when an add-on applies and is billed. */
  note(): Locator {
    return this.card().getByTestId('addons-note');
  }

  /** Said in place of the way to add one, while the subscription is not live. */
  notLive(): Locator {
    return this.card().getByTestId('addons-not-live');
  }

  /** A row of the card, found by the name of the version it lists. */
  row(name: string): Locator {
    return this.card()
      .getByRole('row')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  rows(): Locator {
    return this.card()
      .getByRole('row')
      .filter({ hasNot: this.page.getByRole('columnheader') });
  }

  // --- The quantity --------------------------------------------------------------

  stepper(name: string): Locator {
    return this.page.getByRole('group', { name: `Quantity of ${name}` });
  }

  quantity(name: string): Locator {
    return this.stepper(name).getByTestId('quantity-value');
  }

  more(name: string): Locator {
    return this.stepper(name).getByRole('button', {
      name: `One unit more of ${name}`,
    });
  }

  fewer(name: string): Locator {
    return this.stepper(name).getByRole('button', {
      name: `One unit fewer of ${name}`,
    });
  }

  /** A period being closed: said in place of an error, and sent again by itself. */
  closing(): Locator {
    return this.page.getByTestId('boundary-closing');
  }

  /** The refusal of a change, above the list. */
  alert(): Locator {
    return this.card().getByRole('alert');
  }

  // --- Taking one off ------------------------------------------------------------

  removeButton(name: string): Locator {
    return this.card().getByRole('button', { name: `Remove ${name}` });
  }

  confirmation(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async confirmRemoval() {
    await this.confirmation()
      .getByRole('button', { exact: true, name: 'Remove' })
      .click();
    await expect(this.confirmation()).toHaveCount(0);
  }

  // --- Adding one ----------------------------------------------------------------

  /** The way to the dialog: a link where the subscription is live and the session may. */
  attachLink(): Locator {
    return this.card().getByRole('link', {
      exact: true,
      name: 'Add an add-on',
    });
  }

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async openAttach() {
    await this.attachLink().click();
    await expect(this.addonField()).toBeVisible();
  }

  addonField(): Locator {
    return this.dialog().getByRole('combobox', { name: /^Add-on/ });
  }

  async chooseAddon(name: string) {
    await this.addonField().click();
    await this.page.getByRole('option', { exact: true, name }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  async optionNames(): Promise<string[]> {
    await this.addonField().click();
    const names = await this.page.getByRole('option').allInnerTexts();
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('listbox')).toHaveCount(0);

    return names.map((name) => name.trim());
  }

  attachQuantityField(): Locator {
    return this.dialog().getByLabel(/^Quantity/);
  }

  attachDetails(): Locator {
    return this.dialog().getByTestId('attach-addon-details');
  }

  attachButton(): Locator {
    return this.dialog().getByRole('button', {
      exact: true,
      name: 'Add the add-on',
    });
  }

  /** What the dialog says when there is nothing to add. */
  unavailable(): Locator {
    return this.dialog().getByTestId('attach-addon-unavailable');
  }

  // --- The subscribe dialog ------------------------------------------------------

  subscribeAddons(): Locator {
    return this.dialog().getByTestId('subscribe-addons');
  }

  subscribeChoice(name: string): Locator {
    return this.subscribeAddons().getByRole('checkbox', { name });
  }
}
