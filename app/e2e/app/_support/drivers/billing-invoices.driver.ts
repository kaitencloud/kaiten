import { expect, type Download, type Locator } from '@playwright/test';
import { FilterToolbarDriver } from './filter-toolbar.driver';

/**
 * The invoices of the organization: the list with its search and filters, its
 * paging and its export. The console holds every invoice of the scope and
 * filters them itself; the URL holds the scope alone, the customer or the
 * instance, so the driver also reads what the page holds there.
 */
export class BillingInvoicesDriver extends FilterToolbarDriver {
  /**
   * Opens the list, with the search a link to it would carry, and waits for its
   * title (in the language the page is read in).
   */
  async goto(search = '', title = 'Invoices') {
    await this.page.goto(`/billing/invoices${search}`);
    await expect(
      this.page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
  }

  // --- The rows ----------------------------------------------------------------

  rows(): Locator {
    return this.page.getByRole('row').filter({
      hasNot: this.page.getByRole('columnheader'),
    });
  }

  /** The row of the invoice that leads to `invoiceId`. */
  row(invoiceId: string): Locator {
    return this.rows().filter({
      has: this.page.locator(`a[href="/billing/invoices/${invoiceId}"]`),
    });
  }

  /** The badge that says the status of an invoice of the list, in words. */
  statusBadge(invoiceId: string): Locator {
    return this.row(invoiceId).locator('[data-status]');
  }

  /** Every status badge of the list: what a screen says of each invoice, never by its colour alone. */
  statusBadges(): Locator {
    return this.page.locator(
      'main div[data-status], [data-slot="table"] div[data-status]',
    );
  }

  /** The link of a row, which is what a click on the row follows. */
  link(invoiceId: string): Locator {
    return this.page
      .locator(`a[href="/billing/invoices/${invoiceId}"]`)
      .first();
  }

  /** The ids of the invoices listed, in the order of the rows. */
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

  /**
   * Shows more rows of the table at a time than the ten it opens with: the pager
   * is under the table once there are more rows than a page holds.
   */
  async showRowsPerPage(size: 20 | 30 | 50, label = 'Rows per page') {
    await this.page.getByRole('combobox', { name: label }).click();
    await this.page
      .getByRole('option', { exact: true, name: String(size) })
      .click();
  }

  /**
   * Opens the list and shows as many rows as the pager offers, for a spec that
   * reads rows by their invoice: once what the list first shows is there, the
   * rows (or why there are none), the pager is set to its largest page.
   */
  async gotoShowingEverything(search = '', title = 'Invoices') {
    await this.goto(search, title);
    await expect(
      this.rows().or(this.empty()).or(this.error()).first(),
    ).toBeVisible();
    if (
      (await this.page
        .getByRole('combobox', { name: 'Rows per page' })
        .count()) > 0
    ) {
      await this.showRowsPerPage(50);
    }
  }

  empty(): Locator {
    return this.page.getByTestId('invoices-empty');
  }

  /** The refusal of the API, which the route shows in place of the page, around the console. */
  error(): Locator {
    return this.page.getByTestId('billing-route-error');
  }

  /** Opens the list where the API is armed to refuse it: there is no page, so no title to wait for. */
  async gotoRefused(search = '') {
    await this.page.goto(`/billing/invoices${search}`);
    await expect(this.error()).toBeVisible();
  }

  // --- The scope -----------------------------------------------------------------

  /** Takes the scope off, from the button of its chip: `chip` is what the chip says. */
  async removeScope(chip: string) {
    await this.page
      .getByRole('button', { exact: true, name: `Remove the filter ${chip}` })
      .click();
  }

  // --- The URL -----------------------------------------------------------------

  /** The search params of the page, as the router writes them. */
  searchParams(): URLSearchParams {
    return new URL(this.page.url()).searchParams;
  }

  pathAndSearch(): string {
    const { pathname, search } = new URL(this.page.url());

    return `${pathname}${search}`;
  }

  // --- The export ---------------------------------------------------------------

  exportButton(): Locator {
    return this.page.getByRole('button', { name: 'Export', exact: true });
  }

  /** Picks an export of the menu and returns the file the browser was handed. */
  async export(
    option:
      | 'CSV by invoice line'
      | 'CSV by invoice'
      | 'NDJSON, one invoice per line',
  ): Promise<Download> {
    await this.exportButton().click();
    const download = this.page.waitForEvent('download');
    await this.page
      .getByRole('menuitem', { name: option, exact: true })
      .click();

    return download;
  }

  async openExportMenu() {
    await this.exportButton().click();
    await expect(this.page.getByRole('menu')).toBeVisible();
  }

  /** What the menu says of the filters the file does not apply: absent when it applies them all. */
  exportNote(): Locator {
    return this.page.getByTestId('export-unapplied');
  }
}
