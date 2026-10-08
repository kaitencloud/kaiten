import {
  expect,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * The invoices of the organization: the list with its filters, its paging and its
 * export. The filters are in the URL, so the driver also reads what the page
 * holds there.
 */
export class BillingInvoicesDriver {
  constructor(private readonly page: Page) {}

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

  loadMore(): Locator {
    return this.page.getByRole('button', { name: 'Load more', exact: true });
  }

  skeleton(): Locator {
    return this.page.getByRole('status', { name: 'Loading invoices' });
  }

  empty(): Locator {
    return this.page.getByTestId('invoices-empty');
  }

  error(): Locator {
    return this.page.getByTestId('invoices-error');
  }

  // --- The filters -------------------------------------------------------------

  filtersButton(): Locator {
    return this.page.getByRole('button', { name: /^Filters/ });
  }

  panel(): Locator {
    return this.page.getByRole('dialog', { name: 'Invoice filters' });
  }

  async openFilters() {
    if ((await this.panel().count()) === 0) {
      await this.filtersButton().click();
    }
    await expect(this.panel()).toBeVisible();
  }

  async closeFilters() {
    await this.page.keyboard.press('Escape');
    await expect(this.panel()).toHaveCount(0);
  }

  /** Ticks or unticks a status of the status filter, by its label. */
  async toggleStatus(label: string) {
    await this.openFilters();
    await this.panel()
      .getByRole('checkbox', { name: label, exact: true })
      .click();
  }

  /** Presses an option of a choice of the panel (Kind, Handoff, Provider); pressing it again takes it off. */
  async choose(group: 'Kind' | 'Handoff' | 'Provider', option: string) {
    await this.openFilters();
    await this.panel()
      .getByRole('group', { name: group, exact: true })
      .getByRole('button', { name: option, exact: true })
      .click();
  }

  async setSwitch(label: string, on: boolean) {
    await this.openFilters();
    const toggle = this.panel().getByRole('switch', { name: label });
    if ((await toggle.isChecked()) !== on) {
      await toggle.click();
    }
  }

  /** Types a slug into the customer or instance filter and applies it with Enter. */
  async setSlug(field: 'Customer' | 'Instance', slug: string) {
    await this.openFilters();
    const input = this.panel().getByLabel(field, { exact: true });
    await input.fill(slug);
    await input.press('Enter');
  }

  /** Sets a period of the panel: both days are UTC, the second is where the period ends. */
  async setPeriod(
    period: 'Boundary' | 'Issued',
    from: string | null,
    before: string | null,
  ) {
    await this.openFilters();
    const fieldset = this.panel().getByRole('group', {
      name: period,
      exact: true,
    });
    if (from !== null) {
      await fieldset.getByLabel('From', { exact: true }).fill(from);
    }
    if (before !== null) {
      await fieldset.getByLabel('Before', { exact: true }).fill(before);
    }
  }

  chips(): Locator {
    return this.page.locator('[data-filter]');
  }

  chip(label: string): Locator {
    return this.chips().filter({ hasText: label });
  }

  async expectChips(labels: string[]) {
    await expect(this.chips()).toHaveText(
      labels.map((label) => new RegExp(`^${escape(label)}`)),
    );
  }

  async removeChip(label: string) {
    await this.chip(label)
      .getByRole('button', { name: `Remove the filter ${label}` })
      .click();
  }

  /** The button of the toolbar that takes every filter off: the first of the page, ahead of the list. */
  clearFilters(): Locator {
    return this.page
      .getByRole('button', { name: 'Clear filters', exact: true })
      .first();
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
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
