import { expect, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBillingCustomersModel } from './customers.scenarios';

// A customer with an invoice that was never settled is kept, as one whose
// instance bills. The dialog says which invoices to settle and leads to each.

test.describe('deleting a customer that still has an invoice to settle', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installCustomerAppMocks(page, createBillingCustomersModel());
  });

  test('is refused from the list, with the invoices that keep it', async ({
    page,
  }) => {
    const list = new CustomersListDriver(page);

    await list.goto();
    await list.openDeleteDialog('Gamma Labs');
    await page.getByRole('button', { name: 'Confirm' }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This customer cannot be deleted',
    });
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(
      'Customer "gamma-labs" is billed: cancel its subscriptions and settle its invoices first',
    );
    await expect(refusal).toContainText(
      'None of its subscriptions is running, but some invoices are not settled.',
    );
    await expect(refusal).toContainText('1 invoice not settled');
    await expect(
      refusal.getByRole('link', { name: 'inv-gamma-open' }),
    ).toHaveAttribute('href', '/invoices/inv-gamma-open');
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await refusal.getByRole('button', { name: 'Close' }).first().click();

    await expect(refusal).toHaveCount(0);
    await list.expectCustomerVisible('Gamma Labs');
  });

  test('is refused from the page of the customer, which stays where it is', async ({
    page,
  }) => {
    const detail = new CustomerDetailDriver(page);

    await detail.goto('gamma-labs');
    await detail.expectLoaded('Gamma Labs');
    await detail.deleteButton().click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This customer cannot be deleted',
    });
    await expect(refusal).toContainText('1 invoice not settled');
    // The page the person is on is the customer's: there is nowhere else to send them.
    await expect(
      refusal.getByRole('link', { name: 'Open the customer' }),
    ).toHaveCount(0);
    await refusal.getByRole('button', { name: 'Close' }).first().click();

    await expect(page).toHaveURL(/\/customers\/gamma-labs$/);
    await detail.expectLoaded('Gamma Labs');
  });
});
