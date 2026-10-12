import {
  expect,
  expectErrorToast,
  expectToast,
  recordWrites,
  test,
} from '../_support/app-test';
import { LicensesListDriver } from '../_support/drivers/licenses-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBillingDisabledModel } from '../billing/billing.scenarios';
import {
  createLifecycleBillingModel,
  createLifecycleInstancesModel,
  createLifecycleLicensesModel,
} from '../billing/lifecycle-world';

// A family of licenses is private until it is listed in the public catalogue, which
// serves its default published version. The listing is a billing matter: the API does
// not gate it, so the console does, and the switch is there only where billing is on
// and for a session that may write licenses.

const FAMILY_WRITES = /^\/api\/license-families\/[^/]+$/;

test.describe('listing a family of licenses in the public catalogue', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createLifecycleInstancesModel());
  });

  test('says which families are listed, and offers the switch to list or unlist each', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await licenses.goto();

    await expect(licenses.publicBadge('Enterprise')).toBeVisible();
    await expect(licenses.publicSwitch('Enterprise')).toBeChecked();
    // Families are private until listed: no badge, and the switch is off.
    await expect(licenses.publicBadge('Pro')).toHaveCount(0);
    await expect(licenses.publicSwitch('Pro')).not.toBeChecked();
  });

  test('lists a family with the flag alone, says so, and the badge follows what the API answered', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await licenses.goto();

    await licenses.publicSwitch('Pro').click();

    await expectToast(page, 'The family is listed in the public catalogue');
    await expect(licenses.publicSwitch('Pro')).toBeChecked();
    await expect(licenses.publicBadge('Pro')).toBeVisible();
    expect(writes).toEqual([
      {
        body: { isPublic: true },
        method: 'PATCH',
        pathname: '/api/license-families/pro-v2',
      },
    ]);
  });

  test('takes a family out of the catalogue the same way', async ({ page }) => {
    const licenses = new LicensesListDriver(page);
    const writes = recordWrites(page, FAMILY_WRITES);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await licenses.goto();

    await licenses.publicSwitch('Enterprise').click();

    await expectToast(
      page,
      'The family is no longer listed in the public catalogue',
    );
    await expect(licenses.publicSwitch('Enterprise')).not.toBeChecked();
    await expect(licenses.publicBadge('Enterprise')).toHaveCount(0);
    expect(writes[0].body).toEqual({ isPublic: false });
  });

  test('says in the words of the API why it refused, and leaves the switch where it was', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    const model = createLifecycleLicensesModel();
    model.setNextProblem('updateLicenseFamily', {
      code: 'UpdateLicenseFamily.NoPublishedVersion',
      detail: 'the family has no published version to list',
      status: 409,
    });
    await installLicenseAppMocks(page, model);
    await installBillingAppMocks(page, createLifecycleBillingModel());
    await licenses.goto();

    await licenses.publicSwitch('Pro').click();

    await expectErrorToast(page, 'the family has no published version to list');
    await expect(licenses.publicSwitch('Pro')).not.toBeChecked();
    await expect(licenses.publicBadge('Pro')).toHaveCount(0);
  });

  test('leaves the catalogue out of the list where billing is off, whatever the API says of the family', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await licenses.goto();

    await expect(licenses.family('Enterprise')).toBeVisible();
    await expect(licenses.publicBadge('Enterprise')).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveCount(0);
  });

  test('says which families are listed to a session that may only read, and offers no switch', async ({
    page,
  }) => {
    const licenses = new LicensesListDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installLicenseAppMocks(page, createLifecycleLicensesModel());
    await installBillingAppMocks(page, createLifecycleBillingModel());

    await licenses.goto();

    await expect(licenses.publicBadge('Enterprise')).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
  });
});
