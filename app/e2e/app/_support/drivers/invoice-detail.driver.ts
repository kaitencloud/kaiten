import { expect, type Locator, type Page } from '@playwright/test';

/** What an action of the page opens, to tell which dialog the page showed. */
export type InvoiceActionName =
  | 'Finalize in Stripe'
  | 'Mark as paid'
  | 'Push now'
  | 'Read from Stripe'
  | 'Recompose'
  | 'Release the hold'
  | 'Retry push'
  | 'Void'
  | 'Write off';

/**
 * One invoice: its header, the strip of its three figures, its summary, handoff
 * and identity in a row of cards, its lines across the page with what stands
 * behind them, and the actions its status offers with the dialogs they open. The
 * actions are buttons from the width of a tablet and one menu below it; the driver
 * uses the buttons, and `menu` the menu.
 */
export class InvoiceDetailDriver {
  constructor(private readonly page: Page) {}

  /** Opens an invoice by its id, and waits for its title. */
  async goto(invoiceId: string) {
    await this.page.goto(`/billing/invoices/${invoiceId}`);
    await expect(this.title()).toBeVisible();
  }

  title(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /** The badges of the header: the status, then who collects the invoice. */
  statusBadge(): Locator {
    return this.page.locator('div[data-status]').first();
  }

  providerBadge(): Locator {
    return this.page.locator('div[data-provider]').first();
  }

  // --- Where the invoice stands in its payment provider -------------------------

  /** The card of where the invoice stands in Stripe: absent, not empty, for an invoice nobody collects through a provider. */
  provider(): Locator {
    return this.page.getByTestId('invoice-provider');
  }

  /** The two pages Stripe hosts for the invoice, when it has them. */
  providerLinks(): Locator {
    return this.page.getByTestId('invoice-provider-links');
  }

  /** How Kaiten's amounts compare with Stripe's, with what differs when they do. */
  reconciliation(): Locator {
    return this.page.getByTestId('reconciliation');
  }

  /** The push the person asked for: queued, or out of time. */
  pushStatus(): Locator {
    return this.page.getByTestId('invoice-push-status');
  }

  /** A draft Stripe holds for a person to finalize. */
  awaitingFinalization(): Locator {
    return this.page.getByTestId('invoice-awaiting-finalization');
  }

  pushError(): Locator {
    return this.page.getByTestId('invoice-push-error');
  }

  paymentError(): Locator {
    return this.page.getByTestId('invoice-payment-error');
  }

  /** What the dialog that voids says when Stripe reports the invoice paid and the read failed. */
  voidPaidAtProvider(): Locator {
    return this.dialog().getByTestId('void-paid-at-provider');
  }

  // --- The figures under the header ------------------------------------------

  /** The row of the three figures: the total, the due date and the service period. */
  stats(): Locator {
    return this.page.locator('[data-slot="stat-card-row"]');
  }

  /** One card of the strip, by its label in the language the page is read in. */
  stat(label: string): Locator {
    return this.stats()
      .locator('[data-slot="stat-card"]')
      .filter({
        has: this.page.locator('[data-slot="stat-card-label"]', {
          hasText: new RegExp(`^${label}$`),
        }),
      });
  }

  // --- The lines ---------------------------------------------------------------

  /** The card of the lines, by its title in the language the page is read in. */
  linesCard(title = 'Lines'): Locator {
    return this.card(title);
  }

  lines(): Locator {
    return this.linesCard()
      .getByRole('row')
      .filter({
        hasNot: this.page.getByRole('columnheader'),
      });
  }

  line(label: string): Locator {
    return this.lines().filter({ hasText: label });
  }

  /** The link from a line to the usage reports it was measured from. */
  reportsLink(label: string): Locator {
    return this.line(label).getByRole('link', { name: /usage reports?$/ });
  }

  fingerprint(label: string): Locator {
    return this.line(label).getByTestId('line-fingerprint');
  }

  overageLimits(label: string): Locator {
    return this.line(label).getByTestId('overage-limits');
  }

  /** The totals under the lines: the API's own fields. */
  totals(): Locator {
    return this.linesCard();
  }

  // --- The row of cards, over the lines ----------------------------------------

  /** The card of the summary, by its title in the language the page is read in. */
  summary(title = 'Summary'): Locator {
    return this.card(title);
  }

  handoff(): Locator {
    return this.page.getByTestId('invoice-handoff');
  }

  identity(): Locator {
    return this.card('Billed to');
  }

  private card(title: string): Locator {
    return this.page.locator('[data-slot="card"]').filter({
      has: this.page.locator('[data-slot="card-title"]', {
        hasText: new RegExp(`^${title}$`),
      }),
    });
  }

  holdBanner(): Locator {
    return this.page.getByTestId('hold-banner');
  }

  /** The link to the invoice this one replaces, a row of the summary. */
  replaces(): Locator {
    return this.summary().getByTestId('invoice-replaces');
  }

  /** The link to the invoice that replaced this one, a row of the summary. */
  replacedBy(): Locator {
    return this.summary().getByTestId('invoice-replaced-by');
  }

  // --- The actions -------------------------------------------------------------

  actions(): Locator {
    return this.page.getByTestId('invoice-actions');
  }

  /** The button of an action, on a screen wide enough for the buttons. */
  action(name: InvoiceActionName): Locator {
    return this.actions().getByRole('button', { name, exact: true });
  }

  /**
   * The button of an action by what it does and not by what it is called, for a page read
   * in another language: `retryPush`, `sync`, `void`, `markPaid`, `writeOff`, `recompose`,
   * `releaseHold`.
   */
  actionOf(
    action:
      | 'markPaid'
      | 'recompose'
      | 'releaseHold'
      | 'retryPush'
      | 'sync'
      | 'void'
      | 'writeOff',
  ): Locator {
    return this.actions().locator(`button[data-action="${action}"]`);
  }

  /**
   * What carries the reason an action is disabled: a disabled button swallows
   * pointer events, so the wrapper around it is what a pointer or the keyboard
   * reaches.
   */
  actionReasonTarget(name: InvoiceActionName): Locator {
    return this.action(name).locator('xpath=..');
  }

  /**
   * The buttons of the actions offered, found by what they are and not by their
   * role, which a dialog that is open hides from the accessibility tree.
   */
  actionButtons(): Locator {
    return this.actions().locator('button[data-action]');
  }

  async expectActions(names: InvoiceActionName[]) {
    if (names.length === 0) {
      await expect(this.actions()).toHaveCount(0);

      return;
    }
    await expect(this.actionButtons()).toHaveText(names);
  }

  /** The menu a phone folds the actions into. */
  menu(): Locator {
    return this.page
      .getByTestId('invoice-actions-menu')
      .getByRole('button', { name: /^Actions/ });
  }

  // --- The dialogs -------------------------------------------------------------

  dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  alertDialog(): Locator {
    return this.page.getByRole('alertdialog');
  }

  /** The reason field of the dialog of an audited action. */
  reason(): Locator {
    return this.dialog().getByLabel(/^Reason/);
  }

  /** The confirmation button of the dialog that is open. */
  confirm(name: string): Locator {
    return this.dialog().getByRole('button', { name, exact: true });
  }

  /** Cancels the dialog that is open, whichever kind it is. */
  async cancel() {
    await this.page
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
  }

  /** Fills the reason of an audited action and confirms it. */
  async confirmWithReason(confirmLabel: string, reason: string) {
    await expect(this.dialog()).toBeVisible();
    await this.reason().fill(reason);
    await this.confirm(confirmLabel).click();
  }
}
