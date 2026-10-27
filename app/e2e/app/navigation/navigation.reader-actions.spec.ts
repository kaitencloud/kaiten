import { expect, expectToast, test } from '../_support/app-test';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { installAddonsWorld } from '../addons/install-addons-world';
import { createBillingStackModel } from '../billing/billing.scenarios';
import { createEditableCustomerModel } from '../customers/customers.scenarios';
import { createEditableInstanceModel } from '../instances/instances.scenarios';
import { createPricedCatalogModel } from '../licenses/licenses.scenarios';
import { installVouchersWorld } from '../vouchers/install-vouchers-world';

// A session that may only read is offered no control that writes, and the address of a form
// does not open one: the controls are hidden from its scopes, as the add-ons and the vouchers
// do, and a form opened by hand ends in a 403 only after everything was typed.

test.describe('a session that may only read', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithScopes(page, SESSION_SCOPES.reader);
  });

  test('is offered no way to make, move or end a license', async ({ page }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await page.goto('/catalog/licenses');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pro' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'New License' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: 'New Version' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: /Set as default|Unset default/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^(Publish|Archive|Unarchive)$/ }),
    ).toHaveCount(0);
    // No row has an action: there is no column of empty cells under a header that says so.
    await expect(
      page.getByRole('columnheader', { name: 'Actions' }),
    ).toHaveCount(0);
  });

  test('is shown the grants of a draft license and may not change them', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());

    await page.goto('/catalog/licenses/pro-v4');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^(Remove|Add entitlement)/ }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  });

  test('is told it may not when it opens the address of a license form', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createBillingStackModel());
    await installLicenseAppMocks(page, createPricedCatalogModel());

    for (const address of [
      '/catalog/licenses/new',
      '/catalog/licenses/versions/new',
      '/catalog/licenses/versions/pro-v4',
    ]) {
      await page.goto(address);

      // The card stands for the page: its title is the heading of the page, and the scope it
      // names is written by the console in the language of the interface.
      await expect(
        page.getByRole('heading', { level: 1, name: 'Restricted access' }),
      ).toBeVisible();
      await expect(
        page.getByText('Missing required scope: write:licenses'),
      ).toBeVisible();
    }
  });

  test('is offered no way to make, edit or delete a customer', async ({
    page,
  }) => {
    await installCustomerAppMocks(page, createEditableCustomerModel());

    await page.goto('/customers');
    await expect(page.getByRole('link', { name: 'Acme Corp' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Customer' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);

    await page.goto('/customers/acme-corp');
    await expect(
      page.locator('main').getByText('Acme Corp', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Edit', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit name' })).toHaveCount(
      0,
    );

    // The Instances card of a customer has no New Instance either.
    await expect(
      page.getByRole('button', { name: 'New Instance' }),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'New Instance' })).toHaveCount(
      0,
    );

    // The address of a dialog does not open one: the person is told, and taken back to the page.
    for (const [address, back] of [
      ['/customers/new', '/customers'],
      ['/customers/acme-corp?mode=configure', '/customers/acme-corp'],
    ]) {
      await page.goto(address);

      await expectToast(page, "You don't have access to this action.");
      await expect(page).toHaveURL(back);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });

  test('is offered no way to make, edit or delete an instance', async ({
    page,
  }) => {
    await installInstanceAppMocks(page, createEditableInstanceModel());

    await page.goto('/customers/instances');
    await expect(
      page.getByRole('link', { name: 'Acme Production' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'New Instance' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: /^Delete/ })).toHaveCount(0);
    // Deploying is an update of the instance, and the row has no other action left.
    await expect(page.getByRole('button', { name: 'Deploy' })).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: 'Actions' }),
    ).toHaveCount(0);

    await page.goto('/customers/instances/acme-production');
    await expect(
      page
        .locator('main')
        .getByText('Acme Production', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Edit', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Deploy|Migrate/ }),
    ).toHaveCount(0);

    for (const [address, back] of [
      ['/customers/instances/new', '/customers/instances'],
      [
        '/customers/instances/acme-production?mode=configure',
        '/customers/instances/acme-production',
      ],
    ]) {
      await page.goto(address);

      await expectToast(page, "You don't have access to this action.");
      await expect(page).toHaveURL(back);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });

  test('opens no dialog for a new add-on', async ({ page }) => {
    await installAddonsWorld(page);

    await page.goto('/catalog/addons/new');

    await expectToast(page, "You don't have access to this action.");
    await expect(page).toHaveURL('/catalog/addons');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('opens no wizard for a new voucher', async ({ page }) => {
    await installVouchersWorld(page);

    await page.goto('/catalog/vouchers/new');

    await expect(page.getByText('Restricted access')).toBeVisible();
  });
});
