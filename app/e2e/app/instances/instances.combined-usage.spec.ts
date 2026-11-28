import { expect, test } from '../_support/app-test';
import { expectNoAccessibilityViolations } from '../_support/assertions/accessibility';
import { InstanceEntitlementsDriver } from '../_support/drivers/instance-entitlements.driver';
import { startInLanguage } from '../_support/language';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createCombinedEntitlementModel } from '../entitlements/entitlements.scenarios';
import { createCombinedUsageInstancesModel } from './instances.scenarios';

// A combined entitlement is computed by the API when it is read: the weighted sum of the usage
// of its sources, and of their limits. Nagare Production is granted 1,000 Firecrawl credits and
// 1,000 AI credits, of which it has used 300 and 100: at 0.4 and 0.6 they count for 120 of 400
// and 60 of 600, which the customer reads as one line, "Credits": 180 of 1,000. Nothing is
// reported on it and nothing is enforced on it, and its history is its sources'.

test.describe('a combined entitlement on an instance', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createCombinedUsageInstancesModel());
    await installEntitlementAppMocks(page, createCombinedEntitlementModel());
  });

  test('reads as the sum of its sources, with its limit, and is told from the entitlements it sums', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('nagare-prod');

    const credits = entitlements.row('Credits').filter({
      hasNotText: /Firecrawl|AI Credits/,
    });
    await expect(credits).toContainText('180');
    await expect(credits).toContainText('1,000');
    await expect(credits).toContainText('Combined');
    // The counters it sums are what they were: calculated, each on its own row.
    await expect(entitlements.row('Firecrawl Credits')).toContainText('300');
    await expect(entitlements.row('Firecrawl Credits')).not.toContainText(
      'Combined',
    );
    await expect(entitlements.row('AI Credits')).toContainText('100');
    // The usage card draws it as it draws any counter.
    await expect(entitlements.usageCard()).toContainText('180');
    await expectNoAccessibilityViolations(page);
  });

  test('says how it is made: what each source counts for at its weight, and what that comes to', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('nagare-prod');

    await page.getByRole('button', { name: 'Sources of Credits' }).click();
    const sources = page.getByTestId('combined-sources');
    await expect(sources.getByRole('listitem')).toHaveText([
      'Firecrawl Credits: 300 of 1,000 × 0.4 = 120 of 400',
      'AI Credits: 100 of 1,000 × 0.6 = 60 of 600',
    ]);
    await expect(page.getByRole('dialog')).toContainText(
      'Nothing is enforced on the sum',
    );
    // The row it is on is not opened by it.
    await expect(page).toHaveURL(/\/entitlements$/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('is unlimited as soon as a source is, and says so beside the figures of the others', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('nagare-prod');

    const capacity = entitlements.row('Capacity');
    await expect(capacity).toContainText('12');
    await expect(capacity).toContainText('Unlimited');
    await page.getByRole('button', { name: 'Sources of Capacity' }).click();
    await expect(
      page.getByTestId('combined-sources').getByRole('listitem'),
    ).toHaveText([
      'Seats: 4 of 10 × 2 = 8 of 20',
      'Storage GB: 4 of unlimited × 1 = 4 of unlimited',
    ]);
  });

  test('is said in French with the words of the console', async ({ page }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await startInLanguage(page, 'fr');
    await entitlements.goto('nagare-prod');

    await expect(
      entitlements
        .row('Credits')
        .filter({ hasNotText: /Firecrawl|AI Credits/ }),
    ).toContainText('Combiné');
    await page.getByRole('button', { name: 'Sources de Credits' }).click();
    // The figures are grouped and separated as a French reader writes them.
    await expect(
      page.getByTestId('combined-sources').getByRole('listitem').first(),
    ).toHaveText(/^Firecrawl Credits : 300 sur 1\s000 × 0,4 = 120 sur 400$/);
  });
});
