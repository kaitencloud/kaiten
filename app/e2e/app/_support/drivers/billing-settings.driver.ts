import { expect, type Locator, type Page } from '@playwright/test';

/** The things the health of billing counts, as the tiles name them. */
export type HealthTileId =
  | 'closeBacklog'
  | 'handoff'
  | 'held'
  | 'mismatches'
  | 'overdue'
  | 'pastDue'
  | 'pushFailures';

/**
 * The billing settings of the organization and the export of its data: the page
 * of the defaults, who collects the invoices, how long usage is kept, and, on
 * the settings page, the card that offers the files before an organization is
 * deleted.
 */
export class BillingSettingsDriver {
  constructor(private readonly page: Page) {}

  /**
   * Opens the billing settings and waits for the defaults, down to their first
   * field: the fields are loaded on demand, and a page that is measured or clicked
   * before they are there is one that is still settling.
   */
  async goto() {
    await this.page.goto('/settings/billing');
    await expect(this.defaults()).toBeVisible();
    await expect(this.collectionMethod()).toBeVisible();
  }

  async gotoSettings() {
    await this.page.goto('/settings');
    await expect(
      this.page.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeVisible();
  }

  /** The card of the settings page that leads to the billing settings: absent where billing is. */
  linkCard(): Locator {
    return this.page.getByRole('link', { name: 'Open billing settings' });
  }

  providers(): Locator {
    return this.page.getByTestId('billing-providers');
  }

  /** The row of Stripe in the card of the providers: where it stands, and how its last pass went. */
  stripe(): Locator {
    return this.page.getByTestId('billing-provider-stripe');
  }

  /** How the last pass of Stripe went, under its name: absent where it is not connected. */
  stripeSync(): Locator {
    return this.page.getByTestId('billing-provider-sync');
  }

  // --- The health of billing ---------------------------------------------------------

  health(): Locator {
    return this.page.getByTestId('billing-health');
  }

  /** The tile of one thing the health counts, by the id the console gives it. */
  tile(id: HealthTileId): Locator {
    return this.page.getByTestId(`billing-health-${id}`);
  }

  tiles(): Locator {
    return this.page.getByTestId('billing-health-tiles');
  }

  /** The line that says nothing needs attention, in the place of the tiles. */
  allClear(): Locator {
    return this.page.getByTestId('billing-health-clear');
  }

  healthError(): Locator {
    return this.page.getByTestId('billing-health-error');
  }

  syncNowButton(): Locator {
    return this.health().getByRole('button', { name: 'Sync now' });
  }

  defaults(): Locator {
    return this.page.getByTestId('billing-defaults');
  }

  retention(): Locator {
    return this.page.getByTestId('billing-retention');
  }

  daysField(): Locator {
    return this.defaults().getByLabel(/Payment terms \(days\)/);
  }

  collectionMethod(): Locator {
    return this.defaults().getByRole('combobox');
  }

  handoffStripeInvoicesField(): Locator {
    return this.defaults().getByRole('checkbox', {
      name: 'Hand off Stripe invoices',
    });
  }

  readOnlyNotice(): Locator {
    return this.page.getByTestId('billing-defaults-read-only');
  }

  loadError(): Locator {
    return this.page.getByTestId('billing-settings-error');
  }

  saveButton(): Locator {
    return this.defaults().getByRole('button', { name: 'Save the defaults' });
  }

  // --- The export before an organization is deleted --------------------------------

  exportCard(): Locator {
    return this.page.getByTestId('export-data');
  }

  invoicesExport(): Locator {
    return this.page.getByTestId('invoices-export');
  }

  usageExport(): Locator {
    return this.page.getByTestId('usage-export');
  }

  months(): Locator {
    return this.usageExport()
      .getByRole('list', { name: 'Months of usage' })
      .getByRole('listitem');
  }

  /** The button of the row of a month, by the name of the month as the page writes it. */
  monthButton(month: string): Locator {
    return this.usageExport().getByRole('button', {
      name: `Export the usage of ${month} as a CSV`,
    });
  }
}
