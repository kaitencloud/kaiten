import { expect, test } from '../_support/app-test';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBilledInstancesModel } from './instances.scenarios';

// An instance that bills is kept: while its subscription lives, and while an
// invoice of it is not settled. The API refuses and says what stands in the way,
// which a toast would leave the person to guess, so the console explains it in a
// dialog, with the way to each thing to settle. Nothing was deleted.

test.describe('deleting an instance that bills', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('is refused while its subscription runs, with the status of the subscription and the way to it', async ({
    page,
  }) => {
    const list = new InstancesListDriver(page);

    await list.goto();
    await list.openDeleteDialog('Acme Production');
    await page.getByRole('button', { name: 'Confirm' }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This instance cannot be deleted',
    });
    await expect(refusal).toBeVisible();
    // The explanation is the API's, as it wrote it.
    await expect(refusal).toContainText(
      'Instance "acme-production" is billed: cancel its subscription and settle its invoices first',
    );
    await expect(refusal.getByTestId('deletion-refusal')).toContainText(
      'Active',
    );
    await expect(refusal).toContainText('The subscription is still running.');
    await expect(refusal.getByTestId('deletion-refusal-invoices')).toHaveCount(
      0,
    );
    // A refusal is not a failure: no toast, and the instance is where it was.
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

    await refusal.getByRole('link', { name: 'Open the subscription' }).click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\/billing$/,
    );
  });

  test('is refused for an invoice that is not settled after the subscription ended, which it lists', async ({
    page,
  }) => {
    const detail = new InstanceDetailDriver(page);

    await detail.goto('acme-legacy');
    await detail.expectLoaded('Acme Legacy');
    await detail.deleteButton().click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    const refusal = page.getByRole('dialog', {
      name: 'This instance cannot be deleted',
    });
    await expect(refusal).toContainText('Canceled');
    await expect(refusal).toContainText(
      'The subscription has ended, but some of its invoices are not settled.',
    );
    await expect(refusal).toContainText('1 invoice not settled');
    await expect(refusal).toContainText(
      'Settle each one (paid, void or written off), then try again.',
    );

    await refusal.getByRole('link', { name: 'inv-legacy-open' }).click();

    await expect(page).toHaveURL(/\/invoices\/inv-legacy-open$/);
  });

  test('leaves the instance where it was, and the dialog closes on its button', async ({
    page,
  }) => {
    const list = new InstancesListDriver(page);

    await list.goto();
    await list.openDeleteDialog('Acme Production');
    await page.getByRole('button', { name: 'Confirm' }).click();
    const refusal = page.getByRole('dialog', {
      name: 'This instance cannot be deleted',
    });
    await refusal.getByRole('button', { name: 'Close' }).first().click();

    await expect(refusal).toHaveCount(0);
    await list.expectInstanceVisible('Acme Production');
  });
});
