import { expect, test } from '../_support/app-test';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { FilterToolbarDriver } from '../_support/drivers/filter-toolbar.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createCombinedEntitlementModel,
  createEntitlementsListModel,
} from './entitlements.scenarios';

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

test('shows where the usage of each number comes from, and filters on it', async ({
  page,
}) => {
  const model = createCombinedEntitlementModel();
  const list = new EntitlementsListDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();

  // A combined entitlement is told from the others by a badge; the others say calculated, and a
  // flag has no usage to say the source of.
  await expect(
    list.entitlementRow('Credits').getByText('Combined'),
  ).toBeVisible();
  await expect(
    list.entitlementRow('Monthly Requests').getByText('Calculated'),
  ).toBeVisible();
  await expect(
    list
      .entitlementRow('Advanced Analytics')
      .getByText('Calculated', { exact: true }),
  ).toHaveCount(0);

  const filters = new FilterToolbarDriver(page);
  await filters.addFilter('Usage source');
  await filters.pick('Combined');
  await filters.closeEditor();

  await list.expectEntitlementVisible('Credits');
  await list.expectEntitlementHidden('Firecrawl Credits');
  await list.expectEntitlementHidden('Advanced Analytics');
});
