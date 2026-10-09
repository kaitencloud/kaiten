import type { Page } from '@playwright/test';
import { expect, expectErrorToast, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createEntitlementsListModel,
} from './entitlements.scenarios';

/** The JSON bodies the page sends to the entitlements API with `method`. */
function recordEntitlementBodies(page: Page, method: 'POST' | 'PUT') {
  const bodies: Array<Record<string, unknown>> = [];

  page.on('request', (request) => {
    const { pathname } = new URL(request.url());

    if (
      request.method() === method &&
      /^\/api\/entitlements(\/[^/]+)?$/.test(pathname)
    ) {
      bodies.push(request.postDataJSON());
    }
  });

  return bodies;
}

test('shows the slug the name would give and leaves it to the API when blank', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);
  const created = recordEntitlementBodies(page, 'POST');

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  // Nothing typed yet: a generic example of the format.
  await expect(form.slugField()).toHaveAttribute('placeholder', 'api-calls');

  // The placeholder follows the name, as the API would turn it into a slug;
  // the description spells out the generated shape, random suffix included.
  await form.fill({ name: 'Café Storage Reads' });
  await expect(form.slugField()).toHaveValue('');
  await expect(form.slugField()).toHaveAttribute(
    'placeholder',
    'cafe-storage-reads',
  );
  await expect(form.slugField()).toHaveAccessibleDescription(
    /followed by 6 random characters, e\.g\. "cafe-storage-reads-[0-9a-f]{6}"/,
  );

  await form.nameField().fill('Storage Reads');
  await form.clickNext();
  await form.submitButton().click();

  await expect(page).toHaveURL('/entitlements/storage-reads');
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ name: 'Storage Reads' });
  expect(created[0]).not.toHaveProperty('slug');
});

test('creates the entitlement with the slug typed in the form', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);
  const created = recordEntitlementBodies(page, 'POST');

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Storage Reads' });
  await form.slugField().fill('reads-v2');
  await expect(form.slugField()).toHaveAccessibleDescription(
    /Used as it is: lowercase letters, digits and hyphens/,
  );
  await form.clickNext();
  await form.submitButton().click();

  // The slug of the form wins over the one the name would give.
  await expect(page).toHaveURL('/entitlements/reads-v2');
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({ name: 'Storage Reads', slug: 'reads-v2' });
});

test('holds the wizard on a slug the API would refuse', async ({ page }) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Storage Reads' });
  await expect(form.nextButton()).toBeEnabled();

  await form.slugField().fill('Storage Reads');
  await form.slugField().blur();
  await expect(
    page.getByText('Use lowercase letters, digits and hyphens only'),
  ).toBeVisible();
  await expect(form.nextButton()).toBeDisabled();

  await form.slugField().fill('storage-reads');
  await expect(form.nextButton()).toBeEnabled();
});

test('reports a slug that another entitlement already uses', async ({
  page,
}) => {
  // The list model already holds "api-calls".
  const model = createEntitlementsListModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');

  await form.fill({ name: 'Storage Reads' });
  await form.slugField().fill('api-calls');
  await form.clickNext();
  await form.submitButton().click();

  await expectErrorToast(page);
  await expect(page).toHaveURL('/entitlements/new');
});

test('shows the slug of an existing entitlement, locked, and saves without it', async ({
  page,
}) => {
  const model = createEntitlementsListModel();
  const form = new EntitlementFormDriver(page);
  const updated = recordEntitlementBodies(page, 'PUT');

  await installEntitlementAppMocks(page, model);
  await page.goto('/entitlements/advanced-analytics?mode=configure');

  await expect(form.slugField()).toHaveValue('advanced-analytics');
  await expect(form.slugField()).toBeDisabled();
  await expect(form.slugField()).toHaveAccessibleDescription(
    /Set when the entitlement was created/,
  );

  await form.nameField().fill('Advanced Analytics Plus');
  await form.updateButton().click();

  // A BOOLEAN entitlement has a single step: the update lands on its page,
  // under the slug it was created with.
  await expect(page).toHaveURL('/entitlements/advanced-analytics');
  expect(updated).toHaveLength(1);
  expect(updated[0]).toMatchObject({ name: 'Advanced Analytics Plus' });
  expect(updated[0]).not.toHaveProperty('slug');
});
