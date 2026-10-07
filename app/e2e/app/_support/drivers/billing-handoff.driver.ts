import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The queue the organization's accounting system reads: what waits and what was
 * acknowledged, oldest first, and the acknowledgement by hand.
 */
export class BillingHandoffDriver {
  constructor(private readonly page: Page) {}

  async goto(search = '') {
    await this.page.goto(`/billing/handoff${search}`);
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Handoff' }),
    ).toBeVisible();
  }

  tab(name: 'Waiting' | 'Acknowledged'): Locator {
    return this.page.getByRole('tab', { name, exact: true });
  }

  async showTab(name: 'Waiting' | 'Acknowledged') {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
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
          row
            .querySelector('a[href^="/billing/invoices/"]')
            ?.getAttribute('href') ?? ''
        ).replace('/billing/invoices/', ''),
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
      has: this.page.locator(`a[href="/billing/invoices/${invoiceId}"]`),
    });
  }

  count(): Locator {
    return this.page.getByTestId('handoff-count');
  }

  empty(): Locator {
    return this.page.getByTestId('handoff-empty');
  }

  error(): Locator {
    return this.page.getByTestId('handoff-error');
  }

  skeleton(): Locator {
    return this.page.getByRole('status', { name: 'Loading the queue' });
  }

  loadMore(): Locator {
    return this.page.getByRole('button', { name: 'Load more', exact: true });
  }

  acknowledgeButton(invoiceId: string): Locator {
    return this.row(invoiceId).getByRole('button', {
      name: 'Acknowledge',
      exact: true,
    });
  }

  /** Any button of the page that would claim an invoice: there is none. */
  claimButtons(): Locator {
    return this.page.getByRole('button', { name: /claim/i });
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
