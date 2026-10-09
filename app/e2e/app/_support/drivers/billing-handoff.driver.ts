import { expect, type Locator } from '@playwright/test';
import { FilterToolbarDriver } from './filter-toolbar.driver';

/**
 * The queue the organization's accounting system reads: what waits and what was
 * acknowledged, oldest issue first, and the acknowledgement by hand. The console
 * holds every invoice of the part of the queue it shows and searches, filters,
 * sorts and pages them itself; the URL holds the part of the queue alone.
 */
export class BillingHandoffDriver extends FilterToolbarDriver {
  async goto(search = '') {
    await this.page.goto(`/billing/handoff${search}`);
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Handoff' }),
    ).toBeVisible();
  }

  /** Opens the queue where the API is armed to refuse it: there is no page, so no title to wait for. */
  async gotoRefused(search = '') {
    await this.page.goto(`/billing/handoff${search}`);
    await expect(this.error()).toBeVisible();
  }

  /** The tab of a part of the queue: a link to it, which the page marks as the current one. */
  tab(name: 'Waiting' | 'Acknowledged'): Locator {
    return this.page.getByRole('link', { name, exact: true });
  }

  async showTab(name: 'Waiting' | 'Acknowledged') {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute('aria-current', 'page');
  }

  rows(): Locator {
    return this.page.getByRole('row').filter({
      hasNot: this.page.getByRole('columnheader'),
    });
  }

  /** The ids of the invoices of the queue, in the order of the rows. */
  async invoiceIds(): Promise<string[]> {
    return this.rows().evaluateAll((rows) =>
      rows.map((row) =>
        (
          row.querySelector('a[href^="/invoices/"]')?.getAttribute('href') ?? ''
        ).replace('/invoices/', ''),
      ),
    );
  }

  async expectInvoiceIds(ids: string[]) {
    await expect
      .poll(() => this.invoiceIds(), { timeout: 15_000 })
      .toEqual(ids);
  }

  row(invoiceId: string): Locator {
    return this.rows().filter({
      has: this.page.locator(`a[href="/invoices/${invoiceId}"]`),
    });
  }

  empty(): Locator {
    return this.page.getByTestId('handoff-empty');
  }

  /** The refusal of the API, which the route shows in place of the page, around the console. */
  error(): Locator {
    return this.page.getByTestId('billing-route-error');
  }

  acknowledgeButton(invoiceId: string): Locator {
    return this.row(invoiceId).getByRole('button', {
      name: 'Acknowledge',
      exact: true,
    });
  }

  /**
   * Any button of the page that would claim an invoice: there is none. The header of
   * the column of claims is a button too, which sorts them.
   */
  claimButtons(): Locator {
    return this.page.getByRole('button', { name: /^(?!.*sort).*claim/i });
  }

  // --- The acknowledgement dialog ----------------------------------------------

  dialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Acknowledge the invoice' });
  }

  reference(): Locator {
    return this.dialog().getByLabel('External reference');
  }

  confirm(): Locator {
    return this.dialog().getByRole('button', {
      name: 'Acknowledge',
      exact: true,
    });
  }

  async acknowledge(invoiceId: string, reference?: string) {
    await this.acknowledgeButton(invoiceId).click();
    await expect(this.dialog()).toBeVisible();
    if (reference !== undefined) {
      await this.reference().fill(reference);
    }
    await this.confirm().click();
  }
}
