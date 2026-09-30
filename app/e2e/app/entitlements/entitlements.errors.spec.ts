import { expectErrorToast, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { createEmptyEntitlementsModel } from './entitlements.scenarios';

test.describe('entitlements errors', () => {
  test('shows an error toast when entitlement creation fails with a server error', async ({
    page,
  }) => {
    const model = createEmptyEntitlementsModel();
    const list = new EntitlementsListDriver(page);
    const form = new EntitlementFormDriver(page);

    model.setNextError('create', 500);

    await installEntitlementAppMocks(page, model);
    await list.goto();
    await list.openCreatePage();

    await form.expectLoaded('create');
    await form.fill({
      description: 'Tracks storage reads per billing period',
      name: 'Storage Reads',
    });
    await form.clickNext();
    await form.submitButton().click();

    await expectErrorToast(page);
  });
});
