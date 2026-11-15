import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Instance › AI usage (`/customers/instances/$slug/ai-usage`): the balance of a
 * pool, the inference feed with its filters, and the charge receipt of a row
 * (`?receipt=`), with its refund and "Add as external ID" dialogs.
 */
export class AiUsageDriver {
  constructor(private readonly page: Page) {}

  async goto(instanceSlug: string, search = '') {
    await this.page.goto(
      `/customers/instances/${instanceSlug}/ai-usage${search}`,
    );
    // A receipt opened by the URL hides the tab from the accessibility tree.
    await expect(
      this.page
        .getByRole('heading', { level: 2, name: 'AI usage' })
        .or(this.receipt()),
    ).toBeVisible();
  }

  /** A figure of the pool's balance, by its term ("Consumed", "Available to reserve"). */
  poolFigure(term: string): Locator {
    return this.page
      .getByRole('main')
      .getByRole('term')
      .filter({ hasText: new RegExp(`^${term}$`) })
      .locator('xpath=following-sibling::*[1]');
  }

  // --- The inference feed ----------------------------------------------------

  feed(): Locator {
    return this.page.getByRole('region', { name: 'Inference feed' });
  }

  filter(name: 'Status' | 'Model as sent' | 'Request type' | 'Authorization') {
    return this.feed()
      .getByRole('search', { name: 'Filter inferences' })
      .getByRole('combobox', { name });
  }

  async chooseFilter(
    name: 'Status' | 'Model as sent' | 'Request type' | 'Authorization',
    option: string,
  ) {
    await this.filter(name).click();
    await this.page.getByRole('option', { name: option, exact: true }).click();
    await expect(this.filter(name)).toContainText(option);
  }

  feedRow(transactionId: string): Locator {
    return this.feed()
      .getByRole('row')
      .filter({
        has: this.page.getByRole('button', {
          name: `Open the receipt of ${transactionId}`,
        }),
      });
  }

  // --- The charge receipt ----------------------------------------------------

  async openReceipt(transactionId: string) {
    await this.feed()
      .getByRole('button', { name: `Open the receipt of ${transactionId}` })
      .click();
    await expect(this.receipt()).toContainText(transactionId);
  }

  receipt(): Locator {
    return this.page.getByRole('dialog', { name: 'Charge receipt' });
  }

  /** A part of the receipt, by its heading ("How it was priced", "Refunds"). */
  section(name: string): Locator {
    return this.receipt().getByRole('region', { name, exact: true });
  }

  receiptButton(name: string | RegExp): Locator {
    return this.receipt().getByRole('button', { name });
  }

  async closeReceipt() {
    await this.receiptButton(/^Close$/).click();
    await expect(this.receipt()).toHaveCount(0);
  }

  // --- Refund ----------------------------------------------------------------

  refundDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Refund credits' });
  }

  // --- Add as external ID ----------------------------------------------------

  externalIdDialog(): Locator {
    return this.page.getByRole('dialog', { name: 'Add as an external ID' });
  }
}
