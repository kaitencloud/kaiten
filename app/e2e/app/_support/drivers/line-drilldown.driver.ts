import {
  expect,
  type Download,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * The usage reports a metered line was measured from: its summary, one card per
 * reset window with the reports that counted in it, the paging, the CSV, and what
 * the page shows instead when the reports are no longer kept.
 */
export class LineDrilldownDriver {
  constructor(private readonly page: Page) {}

  /** Opens the reports of a line by its URL, and waits for the line's title. */
  async goto(invoiceId: string, lineId: string, title: string) {
    await this.page.goto(`/invoices/${invoiceId}/lines/${lineId}`);
    await expect(
      this.page.getByRole('heading', { level: 1, name: title }),
    ).toBeVisible();
  }

  summary(): Locator {
    return this.page.locator('[data-slot="card"]').filter({
      has: this.page.locator('[data-slot="card-title"]', {
        hasText: /^This line$/,
      }),
    });
  }

  measuredQuantity(): Locator {
    return this.page.getByTestId('line-measured-quantity');
  }

  billedQuantity(): Locator {
    return this.page.getByTestId('line-billed-quantity');
  }

  fingerprint(): Locator {
    return this.page.getByTestId('line-fingerprint');
  }

  // --- The windows -------------------------------------------------------------

  windows(): Locator {
    return this.page.getByTestId('usage-window');
  }

  window(index: number): Locator {
    return this.windows().nth(index);
  }

  /** What the title of a window card says: its period, or "Whole lifetime". */
  windowTitle(index: number): Locator {
    return this.window(index).locator('[data-slot="card-title"]');
  }

  windowSum(index: number): Locator {
    return this.window(index).getByTestId('usage-window-sum');
  }

  /** The report rows of a window, in the order the API gave them. */
  reportRows(index?: number): Locator {
    const scope = index === undefined ? this.page : this.window(index);

    return scope.getByRole('row').filter({
      hasNot: this.page.getByRole('columnheader'),
    });
  }

  /** The numbers of the reports shown, from the first row to the last. */
  async reportNumbers(): Promise<string[]> {
    return this.reportRows().evaluateAll((rows) =>
      rows.map((row) => row.querySelector('td')?.textContent?.trim() ?? ''),
    );
  }

  /** The reports where the limit in force changed. */
  limitChanges(): Locator {
    return this.page.getByText('Limit changed', { exact: true });
  }

  /** The cell of a column in the row of a report. */
  cell(report: number, column: string): Locator {
    const columns = [
      'Report',
      'Reported at',
      'Behavior',
      'Counter',
      'Change',
      'Overage change',
      'Limit',
      'Transaction',
      'Properties',
    ];

    return this.reportRows()
      .filter({ has: this.page.getByText(String(report), { exact: true }) })
      .first()
      .getByRole('cell')
      .nth(columns.indexOf(column));
  }

  // --- The paging --------------------------------------------------------------

  loadMore(): Locator {
    return this.page.getByRole('button', {
      name: 'Load more reports',
      exact: true,
    });
  }

  // --- The states --------------------------------------------------------------

  skeleton(): Locator {
    return this.page.getByRole('status', { name: 'Loading the usage reports' });
  }

  empty(): Locator {
    return this.page.getByTestId('line-reports-empty');
  }

  error(): Locator {
    return this.page.getByTestId('line-reports-error');
  }

  outsideRetention(): Locator {
    return this.page.getByTestId('outside-retention');
  }

  // --- The way around ----------------------------------------------------------

  backToInvoice(): Locator {
    return this.page.getByRole('link', {
      name: 'Back to the invoice',
      exact: true,
    });
  }

  exportButton(): Locator {
    return this.page.getByRole('button', { name: 'Export CSV', exact: true });
  }

  async exportCsv(): Promise<Download> {
    const download = this.page.waitForEvent('download');
    await this.exportButton().click();

    return download;
  }

  breadcrumbs(): Locator {
    return this.page.getByRole('navigation', { name: 'breadcrumb' });
  }
}
