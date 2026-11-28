import { expect, recordWrites, test } from '../_support/app-test';
import { EntitlementFormDriver } from '../_support/drivers/entitlement-form.driver';
import { EntitlementsListDriver } from '../_support/drivers/entitlements-list.driver';
import { startInLanguage } from '../_support/language';
import { installEntitlementAppMocks } from '../_support/mocks/install-entitlement-app-mocks';
import {
  createEmptyEntitlementsModel,
  createResourceEntitlementModel,
} from './entitlements.scenarios';

// What the limit of a NUMBER entitlement applies to: the instance as a whole (what every
// entitlement did before the choice existed) or each resource of the instance, a competitor, a
// source, a project, with one counter for each against the same limit. It is chosen when the
// entitlement is made and never changes, as the aggregation method does; only the number
// family has one, so a Boolean, a Config or a credit pool is never asked.

const ENTITLEMENT = /^\/api\/entitlements\/[^/]+$/;

test('creates an entitlement with one counter for each resource, and its page says so', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  const writes = recordWrites(page, /^\/api\/entitlements$/);
  await list.goto();
  await list.openCreatePage();
  await form.expectLoaded('create');
  await form.fill({ name: 'Sources per competitor' });
  await form.clickNext();

  // One counter for each instance is what the form starts on.
  await expect(form.limitScopeTrigger()).toContainText(
    'One counter per instance',
  );
  await form.selectLimitScope('One counter per resource');
  await expect(form.limitScopeTrigger()).toContainText(
    'One counter per resource',
  );
  await form.submitButton().click();

  await expect(page).toHaveURL('/catalog/entitlements/sources-per-competitor');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    limitScope: 'RESOURCE',
    name: 'Sources per competitor',
    type: 'NUMBER',
  });
  // The form has gone with the page it was on: what is left says the choice as a row.
  await expect(form.limitScopeTrigger()).toHaveCount(0);
  await expect(
    page.getByText('Limit applies to', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('One counter per resource', { exact: true }),
  ).toBeVisible();
});

test('counts per instance when the choice is left alone, as every entitlement did', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  const writes = recordWrites(page, /^\/api\/entitlements$/);
  await list.goto();
  await list.openCreatePage();
  await form.fill({ name: 'API calls' });
  await form.clickNext();
  await form.submitButton().click();

  await expect(page).toHaveURL('/catalog/entitlements/api-calls');
  expect(writes[0].body).toMatchObject({ limitScope: 'INSTANCE' });
  await expect(form.limitScopeTrigger()).toHaveCount(0);
  await expect(
    page.getByText('One counter per instance', { exact: true }),
  ).toBeVisible();
});

test('is asked of a Number only: a Boolean and a Config entitlement count nothing', async ({
  page,
}) => {
  const model = createEmptyEntitlementsModel();
  const list = new EntitlementsListDriver(page);
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  const writes = recordWrites(page, /^\/api\/entitlements$/);
  await list.goto();
  await list.openCreatePage();
  await form.fill({ name: 'Single sign-on' });
  await form.clickNext();
  await form.selectLimitScope('One counter per resource');

  // The choice made on a Number does not follow the entitlement to the types that have none.
  await form.selectType('Boolean');
  await expect(form.limitScopeTrigger()).toHaveCount(0);
  await form.selectType('Config');
  await expect(form.limitScopeTrigger()).toHaveCount(0);
  await form.selectType('Boolean');
  await form.submitButton().click();

  await expect(page).toHaveURL('/catalog/entitlements/single-sign-on');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({ type: 'BOOLEAN' });
  expect(writes[0].body).not.toHaveProperty('limitScope');
  await expect(page.getByText('Limit applies to', { exact: true })).toHaveCount(
    0,
  );
});

test('shows the choice of an existing entitlement, locked, and sends it back unchanged with any other edit', async ({
  page,
}) => {
  const model = createResourceEntitlementModel();
  const form = new EntitlementFormDriver(page);

  await installEntitlementAppMocks(page, model);
  const writes = recordWrites(page, ENTITLEMENT, ['PUT']);
  await page.goto(
    '/catalog/entitlements/sources-per-competitor?mode=configure',
  );
  await form.descriptionField().fill('Sources followed for each competitor');
  await form.clickNext();

  await expect(form.limitScopeTrigger()).toContainText(
    'One counter per resource',
  );
  await expect(form.limitScopeTrigger()).toBeDisabled();
  await expect(
    page
      .locator('[data-field-name="limitScope"]')
      .getByText("Set when the entitlement was created. It can't be changed."),
  ).toBeVisible();
  await form.updateButton().click();

  await expect(page).toHaveURL('/catalog/entitlements/sources-per-competitor');
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    description: 'Sources followed for each competitor',
    limitScope: 'RESOURCE',
  });
  const stored = await page.evaluate(async () =>
    (await fetch('/api/entitlements/sources-per-competitor')).json(),
  );
  expect(stored.limitScope).toBe('RESOURCE');
});

test('keeps the choice when the entitlement is renamed in place', async ({
  page,
}) => {
  const model = createResourceEntitlementModel();

  await installEntitlementAppMocks(page, model);
  await page.goto('/catalog/entitlements/sources-per-competitor');
  await page.getByRole('button', { name: 'Sources per Competitor' }).click();
  await page
    .getByRole('textbox', { name: 'Edit name' })
    .fill('Sources followed per competitor');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Sources followed per competitor' }),
  ).toBeVisible();

  const stored = await page.evaluate(async () =>
    (await fetch('/api/entitlements/sources-per-competitor')).json(),
  );
  expect(stored.name).toBe('Sources followed per competitor');
  expect(stored.limitScope).toBe('RESOURCE');
});

test('says what the limit applies to on the page of each Number entitlement, and has no row for a flag', async ({
  page,
}) => {
  const model = createResourceEntitlementModel();

  await installEntitlementAppMocks(page, model);

  await page.goto('/catalog/entitlements/api-calls');
  await expect(
    page.getByText('One counter per instance', { exact: true }),
  ).toBeVisible();

  await page.goto('/catalog/entitlements/sources-per-competitor');
  await expect(
    page.getByText('One counter per resource', { exact: true }),
  ).toBeVisible();

  await page.goto('/catalog/entitlements/advanced-analytics');
  await expect(page.getByText('Advanced Analytics').first()).toBeVisible();
  await expect(page.getByText('Limit applies to', { exact: true })).toHaveCount(
    0,
  );
});

test('shows the entitlement in French, in the words of the locales', async ({
  page,
}) => {
  const model = createResourceEntitlementModel();

  await installEntitlementAppMocks(page, model);
  await startInLanguage(page, 'fr');
  await page.goto('/catalog/entitlements/sources-per-competitor');

  await expect(
    page.getByText("La limite s'applique à", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Un compteur par ressource', { exact: true }),
  ).toBeVisible();
});
