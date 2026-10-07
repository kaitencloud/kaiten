import { expect, type Locator, type Page } from '@playwright/test';
import { BILLED_NOW } from '../../billing/billed-instances';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The Billing tab of an instance and the dialog that subscribes it: the tab, the
 * state of its subscription, what its next boundary will issue, its invoices,
 * and the dialog's fields, its summary and what it says once it has started.
 * The page is frozen at the same moment in every spec (`BILLED_NOW`), so that
 * the dates of a period and of a start are the same whatever day it runs.
 */
export class InstanceBillingDriver {
  constructor(private readonly page: Page) {}

  /** Freezes the clock of the page, which the mocks and the console both read. Call before `goto`. */
  async freezeTime() {
    await this.page.clock.setFixedTime(new Date(BILLED_NOW));
  }

  /** Opens the Billing tab of an instance and waits for what it first shows. */
  async goto(instanceSlug: string) {
    await this.page.goto(`/customers/instances/${instanceSlug}/billing`);
    await expect(this.tab()).toBeVisible();
  }

  tab(): Locator {
    return this.page.getByRole('tab', { name: 'Billing', exact: true });
  }

  /** Every tab of the page, in order: the Billing one is absent where billing is. */
  tabs(): Locator {
    return this.page.getByRole('tab');
  }

  // --- The state of the tab ------------------------------------------------------

  notSubscribed(): Locator {
    return this.page.getByTestId('not-subscribed');
  }

  /** The way to the dialog: a link where the session may subscribe, a disabled button where the version is not on sale. */
  subscribeLink(): Locator {
    return this.page.getByRole('link', { exact: true, name: 'Subscribe' });
  }

  subscribeButton(): Locator {
    return this.page.getByRole('button', { exact: true, name: 'Subscribe' });
  }

  unavailableReason(): Locator {
    return this.page.getByTestId('subscribe-unavailable');
  }

  errorProblem(): Locator {
    return this.page.getByTestId('instance-billing-error');
  }

  /** The refusal of the upcoming invoice, which takes the place of its card. */
  upcomingError(): Locator {
    return this.page.getByTestId('upcoming-invoice-error');
  }

  // --- The cards -----------------------------------------------------------------

  subscriptionCard(): Locator {
    return this.card('Subscription');
  }

  upcomingCard(): Locator {
    return this.card('Upcoming invoice');
  }

  /** A row of a card by its label: the row, which holds its value. */
  row(card: Locator, label: string): Locator {
    return card
      .locator('div')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .last();
  }

  wouldHoldBanner(): Locator {
    return this.page.getByTestId('would-hold-banner');
  }

  viewLinesButton(name = 'View the lines'): Locator {
    return this.page.getByRole('button', { name });
  }

  invoicesCount(): Locator {
    return this.page.getByTestId('instance-invoices-count');
  }

  // --- The dialog that subscribes ------------------------------------------------

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async openSubscribe() {
    await this.subscribeLink().click();
    await expect(this.dialog()).toBeVisible();
    // The prices are read when it opens: the form is there once they are.
    await expect(this.basePriceField()).toBeVisible();
  }

  basePriceField(): Locator {
    return this.dialog().getByRole('combobox', { name: /Base price/ });
  }

  async chooseBasePrice(optionName: RegExp | string) {
    await this.basePriceField().click();
    await this.page.getByRole('option', { name: optionName }).click();
  }

  daysUntilDueField(): Locator {
    return this.dialog().getByLabel('Payment terms (days)');
  }

  startAtField(): Locator {
    return this.dialog().getByLabel('Billing starts (UTC)');
  }

  /** Sets the start as the text of the input holds it, and leaves the field so that it says what is wrong. */
  async setStartAt(value: string) {
    await this.startAtField().fill(value);
    await this.startAtField().blur();
  }

  summary(): Locator {
    return this.dialog().getByTestId('subscribe-summary');
  }

  billingEmailNotice(): Locator {
    return this.dialog().getByTestId('billing-email-notice');
  }

  billingEmailField(): Locator {
    return this.billingEmailNotice().getByLabel('Billing e-mail');
  }

  confirmButton(): Locator {
    return this.dialog().getByRole('button', {
      exact: true,
      name: 'Subscribe',
    });
  }

  started(): Locator {
    return this.dialog().getByTestId('subscribed');
  }

  async close() {
    await this.dialog().getByRole('button', { name: 'Close' }).last().click();
    await expect(this.dialog()).toHaveCount(0);
  }

  /** A card of the page by its title, as the language of the page writes it. */
  card(title: string): Locator {
    return this.page
      .locator('[data-slot="card-title"]')
      .filter({ hasText: new RegExp(`^${escapeRegExp(title)}$`) })
      .locator('xpath=ancestor::*[@data-slot="card"][1]')
      .first();
  }
}
