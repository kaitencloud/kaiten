import { expect, test } from '../_support/app-test';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createInvoicesModel } from './billing.scenarios';

// An invoice nobody collects through a payment provider has none of what a
// provider adds to one: no hosted page, no PDF, no reconciliation with the
// provider, no push to retry, no state to sync. They are absent, not empty.

test.describe('an invoice with no payment provider', () => {
  for (const [id, what] of [
    ['inv-m1', 'ready to bill'],
    ['inv-h1', 'a held draft'],
    ['inv-d1', 'a paid one'],
    ['inv-v1', 'a void one'],
  ] as const) {
    test(`shows nothing a provider adds, ${what}`, async ({ page }) => {
      const invoice = new InvoiceDetailDriver(page);
      await installBillingAppMocks(page, createInvoicesModel());

      await invoice.goto(id);

      await expect(invoice.providerBadge()).toHaveText('Manual');
      await expect(
        page.getByRole('link', { name: /Hosted invoice/ }),
      ).toHaveCount(0);
      await expect(page.getByRole('link', { name: /^PDF/ })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Retry push' }),
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Sync' })).toHaveCount(0);
      await expect(page.getByTestId('reconciliation')).toHaveCount(0);
      await expect(page.getByText('Mismatch')).toHaveCount(0);
    });
  }
});
