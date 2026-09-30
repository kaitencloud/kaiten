import { expect, test } from '../_support/app-test';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import { createEntitlementsListModel } from './entitlements.scenarios';

test('lists entitlements, searches by name, and shows correct columns', async ({
  page,
}) => {
  const model = createEntitlementsListModel();
  const list = new EntitlementsListDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();

  // Both entitlements visible initially
  await list.expectEntitlementVisible('API Calls');
  await list.expectEntitlementVisible('Advanced Analytics');

  // Search filters the list
  await list.search('API');
  await list.expectEntitlementVisible('API Calls');
  await list.expectEntitlementHidden('Advanced Analytics');

  // Clear search — both visible again
  await list.search('');
  await list.expectEntitlementVisible('Advanced Analytics');

  // Type column values are visible
  await expect(page.getByText('Number', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Boolean', { exact: true }).first(),
  ).toBeVisible();
});
