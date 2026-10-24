import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The Stripe connector: its tile on the page of the connectors and its own page, where
 * the restricted key and the options of the connection are typed and the connection is
 * ended. Where Stripe stands (connected, free to be, or why it cannot be) is read from
 * the capabilities of billing, and every spec of the page installs both slots: billing
 * for the standing, the connectors for the key and the options.
 */
export class StripeConnectorDriver {
  constructor(private readonly page: Page) {}

  // --- The tile on the connectors page ---------------------------------------------

  async gotoIndex() {
    await this.page.goto('/integrations/connectors');
    await expect(
      this.page.getByRole('heading', { name: 'Connectors' }),
    ).toBeVisible();
    await expect(this.tile()).toBeVisible();
  }

  /** The card of a connector on the index, by its name: its status, what it says and its button. */
  tile(name = 'Stripe'): Locator {
    return this.page
      .locator('[data-slot="card"]')
      .filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** A section of the index by its title ("Connected (1)", "Billing"): the cards under it. */
  section(title: string | RegExp): Locator {
    return this.page.locator('section').filter({
      has: this.page.getByRole('heading', { name: title }),
    });
  }

  // --- The page of the connector -----------------------------------------------------

  async goto() {
    await this.page.goto('/integrations/connectors/stripe');
    await expect(this.title()).toBeVisible();
    await expect(this.settings()).toBeVisible();
  }

  title(): Locator {
    return this.page.getByRole('heading', { level: 1, name: 'Stripe' });
  }

  /** The card of the connection: the key, the options and the button that saves them. */
  settings(): Locator {
    return this.page.getByTestId('stripe-settings');
  }

  /** The badge in the title that says where the connector stands: connected, available or unavailable. */
  standingBadge(): Locator {
    return this.page
      .getByRole('heading', { level: 1, name: 'Stripe' })
      .locator('xpath=ancestor::*[1]')
      .getByText(/^(Connected|Available|Unavailable)$/);
  }

  /** The badge that says which Stripe account the connection reaches. */
  modeBadge(): Locator {
    return this.page.locator('[data-mode]').first();
  }

  /** Why Stripe cannot be connected here, when it cannot. */
  unavailable(): Locator {
    return this.page.getByTestId('stripe-unavailable');
  }

  readOnlyNotice(): Locator {
    return this.page.getByTestId('stripe-read-only');
  }

  // --- The connection --------------------------------------------------------------

  keyField(): Locator {
    return this.settings().getByLabel('Restricted API key');
  }

  taxBehavior(): Locator {
    return this.settings().getByRole('combobox', { name: 'Tax' });
  }

  automaticTax(): Locator {
    return this.settings().getByRole('checkbox', {
      name: 'Compute tax automatically',
    });
  }

  autoFinalize(): Locator {
    return this.settings().getByRole('checkbox', {
      name: 'Finalize invoices automatically',
    });
  }

  /** The button that connects, or saves: its name follows where the connector stands. */
  saveButton(
    name:
      | 'Connect Stripe'
      | 'Connect Stripe with the stored key'
      | 'Save changes',
  ): Locator {
    return this.settings().getByRole('button', { exact: true, name });
  }

  /** Types a key and saves it by pressing the button that is there. */
  async saveKey(
    key: string,
    button: 'Connect Stripe' | 'Save changes' = 'Save changes',
  ) {
    await this.keyField().fill(key);
    await this.saveButton(button).click();
  }

  // --- Ending the connection --------------------------------------------------------

  disconnectButton(): Locator {
    return this.page.getByRole('button', { exact: true, name: 'Disconnect' });
  }

  /** The confirmation that opens over the page. */
  disconnectDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  async openDisconnect() {
    await this.disconnectButton().click();
    await expect(this.disconnectDialog()).toBeVisible();
  }

  confirmDisconnect(): Locator {
    return this.disconnectDialog().getByRole('button', {
      exact: true,
      name: 'Disconnect',
    });
  }

  /** What the API refused the disconnection with, in the dialog. */
  disconnectRefusal(): Locator {
    return this.disconnectDialog().getByTestId('stripe-disconnect-refused');
  }

  /** What still routes to Stripe, one line for each thing that does. */
  routing(): Locator {
    return this.disconnectDialog().getByTestId('stripe-routing');
  }
}
