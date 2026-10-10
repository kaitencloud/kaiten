import { expect, type Locator } from '@playwright/test';
import { FilterToolbarDriver } from './filter-toolbar.driver';

/** The two parts of the queue: what waits for the accounting system, and what it acknowledged. */
export type QueuePart = 'ACKNOWLEDGED' | 'PENDING';

/** The status views of the list of invoices, the tabs above its toolbar, as their link says them. */
export type InvoicesViewName =
  | 'Acknowledged'
  | 'All'
  | 'Held'
  | 'Overdue'
  | 'Waiting for your ERP';

const QUEUE_VIEWS = {
  ACKNOWLEDGED: 'acknowledged',
  PENDING: 'waiting',
} as const satisfies Record<QueuePart, string>;

/**
 * The queue the organization's accounting system reads, which is two status
 * views of the list of invoices (`?view=waiting`, `?view=acknowledged`): what waits and
 * what was acknowledged, oldest issue first, and the acknowledgement by hand. The
 * console holds every invoice of the part of the queue it shows and searches, filters,
 * sorts and pages them itself; the URL holds the view alone.
 */
export class BillingHandoffDriver extends FilterToolbarDriver {
  private path(queue: QueuePart = 'PENDING') {
    return `/invoices?view=${QUEUE_VIEWS[queue]}`;
  }

  async goto(queue?: QueuePart) {
    await this.page.goto(this.path(queue));
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Invoices' }),
    ).toBeVisible();
    // The parts of the queue are tabs of the row, where the queue matters.
    await expect(this.tab('Waiting for your ERP')).toBeVisible();
  }

  /** Opens the queue where the API is armed to refuse it: there is no page, so no title to wait for. */
  async gotoRefused(queue?: QueuePart) {
    await this.page.goto(this.path(queue));
    await expect(this.error()).toBeVisible();
  }

  /**
   * The tab of a status view: a link to it, which the page marks as the current one.
   * Its name holds the count that follows the label, so it is matched as a prefix.
   */
  tab(name: InvoicesViewName): Locator {
    return this.page.getByRole('link', {
      name: new RegExp(`^${name}( \\d+)?$`),
    });
  }

  /** The count a tab shows next to its label. */
  async count(name: InvoicesViewName): Promise<number> {
    const text = (await this.tab(name).textContent()) ?? '';

    return Number(text.replace(name, '').trim());
  }

  async showTab(name: InvoicesViewName) {
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
