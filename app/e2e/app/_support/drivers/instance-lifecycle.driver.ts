import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The life of a subscription, on the Billing tab of its instance: what the tab says
 * of a trial, an invoice that is overdue, a cancellation or a plan change that waits
 * for the boundary, what may be done to the subscription, and the three dialogs it
 * opens (cancel, change the plan, change the payment terms). Each dialog is a route
 * over the tab, so that closing it leads back to the tab. The tab itself is
 * `InstanceBillingDriver`'s.
 */
export class InstanceLifecycleDriver {
  constructor(private readonly page: Page) {}

  // --- What the tab says ---------------------------------------------------------

  notices(): Locator {
    return this.page.getByTestId('subscription-notices');
  }

  trialNotice(): Locator {
    return this.page.getByTestId('trial-notice');
  }

  pastDueNotice(): Locator {
    return this.page.getByTestId('past-due-notice');
  }

  cancellationNotice(): Locator {
    return this.page.getByTestId('cancellation-notice');
  }

  scheduledChangeNotice(): Locator {
    return this.page.getByTestId('scheduled-change-notice');
  }

  /** The things that may be done to a live subscription, under its card. */
  actions(): Locator {
    return this.page.getByTestId('subscription-actions');
  }

  // --- What may be done ----------------------------------------------------------

  changePlanLink(): Locator {
    return this.actions().getByRole('link', {
      exact: true,
      name: 'Change plan',
    });
  }

  /** The plan change a state forbids: a button the keyboard still reaches, and says why. */
  changePlanButton(): Locator {
    return this.actions().getByRole('button', {
      exact: true,
      name: 'Change plan',
    });
  }

  termsLink(): Locator {
    return this.actions().getByRole('link', {
      exact: true,
      name: 'Payment terms',
    });
  }

  cancelLink(): Locator {
    return this.actions().getByRole('link', {
      exact: true,
      name: 'Cancel subscription',
    });
  }

  /** The one click that takes a cancellation back, in its notice. */
  reactivateButton(): Locator {
    return this.cancellationNotice().getByRole('button', {
      exact: true,
      name: 'Reactivate',
    });
  }

  /** The one click that drops a plan change, in its notice. */
  dropChangeButton(): Locator {
    return this.scheduledChangeNotice().getByRole('button', {
      exact: true,
      name: 'Cancel the change',
    });
  }

  /** A period being closed: said in place of an error, and sent again by itself. */
  closing(): Locator {
    return this.page.getByTestId('boundary-closing');
  }

  // --- The dialogs ---------------------------------------------------------------

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  /** Closes the dialog the way a person does, and waits for the tab it leads back to. */
  async close() {
    await this.dialog().getByRole('button', { name: 'Close' }).last().click();
    await expect(this.dialog()).toHaveCount(0);
  }

  alert(): Locator {
    return this.dialog().getByRole('alert');
  }

  // The cancel dialog.

  async openCancel(instanceName: string) {
    await this.cancelLink().click();
    await expect(
      this.dialog().getByRole('heading', {
        name: `Cancel the subscription of ${instanceName}`,
      }),
    ).toBeVisible();
    // The subscription is read when it opens: the form is there once it is.
    await expect(this.cancelConfirmButton()).toBeVisible();
  }

  /** Ends the subscription: the confirmation of a cancellation, or the end of a trial. */
  cancelConfirmButton(): Locator {
    return this.dialog().getByRole('button', {
      name: /^(Cancel subscription|End the trial)$/,
    });
  }

  cancelModeField(): Locator {
    return this.dialog().getByRole('combobox', { name: /When/ });
  }

  async chooseCancelMode(name: string) {
    await this.cancelModeField().click();
    await this.page.getByRole('option', { exact: true, name }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  cancelExplanation(): Locator {
    return this.dialog().getByTestId('cancel-explanation');
  }

  reasonField(): Locator {
    return this.dialog().getByLabel('Reason', { exact: true });
  }

  removeAddonsCheckbox(): Locator {
    return this.dialog().getByRole('checkbox', {
      name: 'Also remove the add-ons',
    });
  }

  setEndDateCheckbox(): Locator {
    return this.dialog().getByRole('checkbox', {
      name: 'Also set the license end date',
    });
  }

  endDateField(): Locator {
    return this.dialog().getByLabel('License ends (UTC)');
  }

  /** What the dialog says once the cancellation was accepted. */
  canceled(): Locator {
    return this.dialog().getByTestId('canceled');
  }

  followUps(): Locator {
    return this.dialog().getByTestId('cancel-follow-ups');
  }

  // The plan change dialog.

  async openPlanChange(instanceName: string) {
    await this.changePlanLink().click();
    await expect(
      this.dialog().getByRole('heading', {
        name: `Change the plan of ${instanceName}`,
      }),
    ).toBeVisible();
  }

  planField(): Locator {
    return this.dialog().getByRole('combobox', { name: /New plan/ });
  }

  async openPlanOptions() {
    // The plans are read when it opens: the field is there once they are.
    await expect(this.planField()).toBeVisible();
    await this.planField().click();
  }

  async choosePlan(name: RegExp | string) {
    await this.openPlanOptions();
    await this.page.getByRole('option', { name }).click();
    await expect(this.page.getByRole('listbox')).toHaveCount(0);
  }

  schedulePlanButton(): Locator {
    return this.dialog().getByRole('button', { name: 'Schedule the change' });
  }

  planTimeline(): Locator {
    return this.dialog().getByTestId('plan-change-timeline');
  }

  scheduledSummary(): Locator {
    return this.dialog().getByTestId('plan-change-scheduled');
  }

  planUnavailable(): Locator {
    return this.dialog().getByTestId('plan-change-unavailable');
  }

  // The payment terms dialog.

  async openTerms(instanceName: string) {
    await this.termsLink().click();
    await expect(
      this.dialog().getByRole('heading', {
        name: `Payment terms of ${instanceName}`,
      }),
    ).toBeVisible();
    await expect(this.daysField()).toBeVisible();
  }

  daysField(): Locator {
    return this.dialog().getByLabel('Payment terms (days)');
  }

  currentTerms(): Locator {
    return this.dialog().getByTestId('payment-terms-current');
  }

  // The dialog of the provider and the terms, where a payment provider is offered.

  providerTermsLink(): Locator {
    return this.actions().getByRole('link', {
      exact: true,
      name: 'Provider and terms',
    });
  }

  async openProviderTerms(instanceName: string) {
    await this.providerTermsLink().click();
    await expect(
      this.dialog().getByRole('heading', {
        name: `Provider and terms of ${instanceName}`,
      }),
    ).toBeVisible();
    await expect(this.providerField()).toBeVisible();
  }

  /** Who collects the invoices of the contract. */
  providerField(): Locator {
    return this.dialog().getByRole('combobox', { name: /Collected by/ });
  }

  /** How they are collected: the invoice is sent, or the card on file is charged. */
  collectionField(): Locator {
    return this.dialog().getByRole('combobox', { name: /Collection method/ });
  }

  /** Picks an option of the list that is open. */
  async pickOption(name: string | RegExp) {
    await this.page
      .getByRole('option', { exact: typeof name === 'string', name })
      .click();
  }

  /** Lets Stripe collect the contract: the list is opened and Stripe picked. */
  async chooseProvider(name: string | RegExp) {
    await this.providerField().click();
    await this.pickOption(name);
  }

  /** What is said when Stripe is offered and not connected: why, and the way to connect it. */
  connectStripeHint(): Locator {
    return this.dialog().getByTestId('terms-connect-hint');
  }

  /** What the API would refuse that the dialog can tell already. */
  termsWarning(): Locator {
    return this.dialog().getByTestId('terms-warning');
  }

  /** The invoices of the contract that are still open, and what becomes of each when the provider changes. */
  openInvoices(): Locator {
    return this.dialog().getByTestId('open-invoices');
  }

  /** One open invoice of that list, by the invoice it leads to. */
  openInvoice(invoiceId: string): Locator {
    return this.openInvoices()
      .getByTestId('open-invoice')
      .filter({
        has: this.page.locator(`a[href="/invoices/${invoiceId}"]`),
      });
  }

  saveTermsButton(): Locator {
    return this.dialog().getByRole('button', { exact: true, name: 'Save' });
  }

  useDefaultTermsButton(): Locator {
    return this.dialog().getByRole('button', {
      exact: true,
      name: 'Use organization default',
    });
  }
}
