import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The payment method of a customer in Stripe, on the page of the customer: the card
 * Stripe charges for the contracts that collect automatically, as the labels Kaiten keeps
 * of it, and what is done to it. Kaiten never sees a card: adding or replacing one sends
 * the browser to a page Stripe hosts, which comes back to the page of the customer.
 */
export class CustomerPaymentMethodDriver {
  constructor(private readonly page: Page) {}

  /** Opens the page of a customer, with what Stripe's page added to the address when it came back. */
  async goto(customerSlug: string, search = '') {
    await this.page.goto(`/customers/${customerSlug}${search}`);
    await expect(this.page.getByText('Customer details')).toBeVisible();
  }

  /** The card of the payment method: absent where Stripe is not connected or the session may not read it. */
  card(): Locator {
    return this.page.getByTestId('payment-method-card');
  }

  /** What Stripe holds as the method: its brand and last four digits, when it expires, where it stands. */
  summary(): Locator {
    return this.card().getByTestId('payment-method');
  }

  add(): Locator {
    return this.card().getByRole('button', { name: 'Add a payment method' });
  }

  replace(): Locator {
    return this.card().getByRole('button', { exact: true, name: 'Replace' });
  }

  portal(): Locator {
    return this.card().getByRole('button', { name: 'Manage in Stripe' });
  }

  remove(): Locator {
    return this.card().getByRole('button', { exact: true, name: 'Remove' });
  }

  /** The link to the customer in the dashboard of Stripe. */
  inStripe(): Locator {
    return this.card().getByRole('link', {
      name: 'Open the customer in Stripe',
    });
  }

  /** The panel that says a method was not saved, with the way to check again. */
  setupFailed(): Locator {
    return this.card().getByTestId('payment-method-setup-failed');
  }

  /** The confirmation of the removal. */
  removeDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  removeRefusal(): Locator {
    return this.removeDialog().getByTestId('payment-method-remove-refused');
  }

  /** The dialog that asks a currency of a customer with no contract to take it from. */
  currencyDialog(): Locator {
    return this.page.getByRole('dialog', {
      name: 'Currency of the payment method',
    });
  }

  /** Keeps the browser on the console when it is sent to a page Stripe hosts: the page is a stand-in. */
  async standInForStripe() {
    await this.page.route(
      /^https:\/\/(checkout|billing|dashboard)\.stripe\.com\//,
      (route) =>
        route.fulfill({
          body: '<!doctype html><title>Stripe</title><p>Stripe</p>',
          contentType: 'text/html',
        }),
    );
  }
}
