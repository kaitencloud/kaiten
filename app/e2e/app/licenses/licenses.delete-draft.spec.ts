import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { LicenseDetailDriver } from '../_support/drivers/license-detail.driver';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import {
  createBillingDisabledModel,
  createBillingStackModel,
} from '../billing/billing.scenarios';
import {
  createDraftPricesModel,
  createLicenseCatalogModel,
} from './licenses.scenarios';

// Deleting a draft version. The API asks for its grants to go before it does,
// and refuses to remove a grant an active metered price measures, so a draft
// that carries such a price has it deprecated first: a draft was never on sale,
// and its prices are deleted with it.

const DRAFT_WRITES = /^\/api\/licenses\/(pro-v4|starter-v4)(\/.*)?$/;

test.describe('deleting a draft', () => {
  test('deprecates the metered price, then removes the grants, then deletes the version', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createDraftPricesModel());
    const writes = recordWrites(page, DRAFT_WRITES);

    await detail.goto('pro-v4', 'Pro');
    await detail.lifecycleAction('Delete').click();
    const dialog = page.getByRole('alertdialog');
    // Where billing is on, a draft goes with its prices, and the dialog says so.
    await expect(dialog).toContainText(
      'The draft, its prices and the entitlements it grants are deleted.',
    );
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expectToast(page, 'Draft deleted');
    await expect(page).toHaveURL('/catalog/licenses');
    // Only the usage price on requests blocks a grant, and it is retired before
    // the first grant goes: the flat fee needs nothing, since it is deleted with
    // the version.
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual([
      'POST /api/licenses/pro-v4/prices/price-2-usage/deprecate',
      'DELETE /api/licenses/pro-v4/entitlements/traces',
      'DELETE /api/licenses/pro-v4/entitlements/requests',
      'DELETE /api/licenses/pro-v4/entitlements/seats',
      'DELETE /api/licenses/pro-v4/entitlements/latency',
      'DELETE /api/licenses/pro-v4/entitlements/credits',
      'DELETE /api/licenses/pro-v4/entitlements/sso',
      'DELETE /api/licenses/pro-v4/entitlements/theme',
      'DELETE /api/licenses/pro-v4',
    ]);
  });

  test('leaves the grants and the version in place when a price cannot be retired, and says why', async ({
    page,
  }) => {
    const detail = new LicenseDetailDriver(page);
    const model = createDraftPricesModel();
    model.setNextProblem('deprecatePrice', {
      code: 'DeprecateLicensePrice.PlanChangeTarget',
      detail: 'a scheduled plan change targets this price',
      status: 409,
    });
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, model);
    const writes = recordWrites(page, DRAFT_WRITES);

    await detail.goto('pro-v4', 'Pro');
    await detail.lifecycleAction('Delete').click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();

    await expectToast(page, 'a scheduled plan change targets this price');
    // Nothing else was touched: no grant was removed, and the version is still
    // there, with all it grants.
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual(['POST /api/licenses/pro-v4/prices/price-2-usage/deprecate']);
    await expect(page).toHaveURL('/catalog/licenses/pro-v4');
    await expect(detail.grantRow('Traces')).toBeVisible();
    await expect(detail.grantRow('Theme')).toBeVisible();
  });

  test('asks for no price where billing is not there', async ({ page }) => {
    const list = new LicensesListDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installLicenseAppMocks(page, createLicenseCatalogModel());
    const writes = recordWrites(page, DRAFT_WRITES);
    const reads: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (/^\/api\/licenses\/[^/]+\/prices/.test(pathname)) {
        reads.push(`${request.method()} ${pathname}`);
      }
    });

    await list.goto();
    await list.expandFamily('Starter');
    await list.lifecycleAction('Starter', 'Next', 'Delete').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(
      'The draft and the entitlements it grants are deleted.',
    );
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expectToast(page, 'Draft deleted');
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual(['DELETE /api/licenses/starter-v4']);
    expect(reads).toEqual([]);
  });
});
