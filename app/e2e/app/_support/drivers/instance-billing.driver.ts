import { expect, type Locator, type Page } from '@playwright/test';
import { BILLED_NOW } from '../../billing/billed-instances';
import { pickDateTime, typeTime } from './date-picker.driver';

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

  /** What the card says when the usage its invoice would be composed from is no longer kept. */
  upcomingOutsideRetention(): Locator {
    return this.page.getByTestId('upcoming-invoice-outside-retention');
  }

  // --- The cards -----------------------------------------------------------------

  subscriptionCard(): Locator {
    return this.card('Subscription');
  }

  upcomingCard(): Locator {
    return this.card('Upcoming invoice');
  }

  /**
   * A row of a card by its label: the row, which holds its value. What may be done to
   * the subscription is under the rows and has links named like some of them (the
   * payment terms): it is not a row.
   */
  row(card: Locator, label: string): Locator {
    return card
      .locator('div:not([data-testid="subscription-actions"])')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .last();
  }

  wouldHoldBanner(): Locator {
    return this.page.getByTestId('would-hold-banner');
  }

  viewLinesButton(name = 'View the lines'): Locator {
    return this.page.getByRole('button', { name });
  }

  /** The rows of the card of the invoices of the instance. */
  invoiceRows(): Locator {
    return this.card('Invoices')
      .getByRole('row')
      .filter({ hasNot: this.page.getByRole('columnheader') });
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

  /** The trial, in days: there where the release has trials, and the price bills in advance. */
  trialDaysField(): Locator {
    return this.dialog().getByLabel('Trial (days)');
  }

  /** What replaces the trial for a price billed in arrears. */
  trialUnavailable(): Locator {
    return this.dialog().getByTestId('trial-unavailable');
  }

  startAtField(): Locator {
    // The label names the pair of controls as a group too: the date button is the one picked from.
    return this.dialog().getByRole('button', { name: 'Billing starts (UTC)' });
  }

  /** Picks the start day on the calendar of the field and sets its time beside it, as the text of the field holds it (`2026-09-30T09:30`, UTC), and closes it so that the field says what is wrong. */
  async setStartAt(value: string) {
    await pickDateTime(this.startAtField(), value);
  }

  /** Types a time beside the start day without picking a day, and leaves the field. */
  async typeStartAtTime(time: string) {
    await typeTime(this.startAtField(), time);
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
