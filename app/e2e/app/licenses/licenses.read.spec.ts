import { expect, test } from '../_support/app-test';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import {
  createLicenseCatalogModel,
  createPricedCatalogModel,
} from './licenses.scenarios';

test('lists a family with the lifecycle state and transition of each version', async ({
  page,
}) => {
  const list = new LicensesListDriver(page);

  await installLicenseAppMocks(page, createLicenseCatalogModel());
  await list.goto();
  await list.expandFamily('Starter');

  await list.expectVersionState('Starter', 'Legacy', 'Archived');
  await list.expectVersionState('Starter', 'GA', 'Published');
  await list.expectVersionState('Starter', 'Spring', 'Published');
  await list.expectVersionState('Starter', 'Next', 'Draft');

  // Each version offers the one transition its state accepts.
  await expect(
    list.lifecycleAction('Starter', 'Legacy', 'Unarchive'),
  ).toBeEnabled();
  await expect(
    list.lifecycleAction('Starter', 'Spring', 'Archive'),
  ).toBeEnabled();
  await expect(
    list.lifecycleAction('Starter', 'Next', 'Publish'),
  ).toBeEnabled();
  // The family's default cannot be archived.
  await expect(list.lifecycleAction('Starter', 'GA', 'Archive')).toBeDisabled();
});

// How a version is sold is billing's: the list shows it only where billing is on,
// and shows no price of a version, which a list would need a request per version
// for.
test.describe('how each version is sold', () => {
  test('is a badge on every version of the list where billing is on', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);

    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());
    await list.goto();
    await list.expandFamily('Pro');

    await expect(list.columnHeader('Pro', 'Pricing')).toBeVisible();
    for (const versionName of ['Pro 2025', 'Pro 2026', 'Pro 2027']) {
      // The type of the license and how it is sold are two columns that can
      // both read "Paid": the badge is the one under "Pricing".
      await expect(
        await list.versionCell('Pro', versionName, 'Pricing'),
      ).toHaveText('Paid');
    }
    // The state and the default flag stay where they were.
    await list.expectVersionState('Pro', 'Pro 2026', 'Published');
    await list.expectVersionState('Pro', 'Pro 2027', 'Draft');
    await expect(
      await list.versionCell('Pro', 'Pro 2026', 'Default'),
    ).toContainText('Default');
  });

  test('is not in the list where billing is not there, which would read Custom everywhere', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);

    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installLicenseAppMocks(page, createPricedCatalogModel());
    await list.goto();
    await list.expandFamily('Pro');

    await list.expectVersionState('Pro', 'Pro 2026', 'Published');
    await expect(list.columnHeader('Pro', 'Pricing')).toHaveCount(0);
  });

  test('shows no price of a version, whatever the version is billed', async ({
    page,
  }) => {
    const list = new LicensesListDriver(page);
    const priceRequests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/^\/api\/licenses\/[^/]+\/prices/.test(pathname)) {
        priceRequests.push(pathname);
      }
    });

    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());
    await list.goto();
    await list.expandFamily('Pro');
    await list.expectVersionState('Pro', 'Pro 2026', 'Published');

    await expect(page.getByText('$29.00')).toHaveCount(0);
    expect(priceRequests).toEqual([]);
  });
});
