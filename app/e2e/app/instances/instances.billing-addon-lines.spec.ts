import { expect, test } from '../_support/app-test';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createAddonLinesModel } from '../billing/billing.scenarios';
import { createBilledInstancesModel } from './instances.scenarios';

// What the next boundary of an instance will issue for the add-ons it holds and has held:
// the fee of the period that starts for the ones it holds, and, in full, the fee in
// arrears of one that was removed since the period began, over the window it was held.

test.describe('the upcoming invoice of an instance with add-ons', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installInstanceAppMocks(page, createBilledInstancesModel());
    await installBillingAppMocks(page, createAddonLinesModel());
  });

  test('carries the fee of the add-ons it holds and that of one removed before the boundary', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);

    await billing.goto('acme-production');

    const upcoming = billing.upcomingCard();
    await expect(upcoming).toContainText('3 lines');
    // $20.00 of the Onboarding pack, $499.00 of the base and $30.00 of the seats: the
    // total is the API's. Nothing is rated for the tokens, which have no usage to rate.
    await expect(upcoming).toContainText('$549.00');

    await billing.viewLinesButton().click();
    const preview = page.getByRole('dialog', { name: 'Upcoming invoice' });
    const lines = preview
      .getByRole('row')
      .filter({ hasNot: page.getByRole('columnheader') });
    await expect(lines).toHaveCount(3);
    const [removed, base, seats] = await lines.all();
    await expect(removed).toContainText('Onboarding pack × 1');
    // Attached on September 20th and removed on October 3rd, before the boundary of the
    // 15th: the window it was held, billed in full.
    await expect(removed).toContainText(
      'Sep 20, 2026, 12:00 AM – Oct 3, 2026, 8:00 AM (UTC)',
    );
    await expect(removed).toContainText('$20.00');
    await expect(removed.getByTestId('invoice-line-addon')).toHaveText(
      'From the add-on Onboarding pack, removed on Oct 3, 2026, 8:00 AM (UTC)',
    );
    await expect(base).toContainText('Oct 15 – Nov 15, 2026 (UTC)');
    await expect(seats).toContainText('Extra seats × 3');
    await expect(seats).toContainText('Oct 15 – Nov 15, 2026 (UTC)');
    await expect(seats).toContainText('$30.00');
  });
});
