import type { Page } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { expectNoAccessibilityViolations } from '../_support/assertions/accessibility';
import { pickDateTime } from '../_support/drivers/date-picker.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { installLicenseAppMocks } from '../_support/mocks/install-license-app-mocks';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { signInWithScopes } from '../_support/session-scopes';
import { buildEntitlement, buildGrant } from '../_support/fixtures';
import { InstanceAppModel } from '../_support/model/instance-app-model';
import { LicenseAppModel } from '../_support/model/license-app-model';
import { identityProvenance } from '../_support/model/effective-entitlement';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import {
  createVouchersInstancesModel,
  createVouchersLicensesModel,
} from '../vouchers/vouchers.scenarios';
import { BILLED_NOW } from '../billing/billed-instances';
import type { EntitlementException } from '@/api-client';

const BASE = '/customers/instances/initech-prod/entitlements';
const SSO = buildEntitlement({ name: 'SSO', slug: 'sso', type: 'BOOLEAN' });
const row = (
  overrides: Partial<EntitlementException> = {},
): EntitlementException => ({
  id: 'exception-sso',
  instanceSlug: 'initech-prod',
  entitlementSlug: 'sso',
  entitlementType: 'BOOLEAN',
  kind: 'SET',
  value: false,
  reason: 'Private evaluation reason',
  startsAt: '2026-10-01T09:00:00Z',
  endsAt: '2026-11-01T09:00:00Z',
  status: 'ACTIVE',
  createdAt: BILLED_NOW,
  revokedAt: null,
  ...overrides,
});
async function install(page: Page, rows: EntitlementException[] = []) {
  const licenseState = createVouchersLicensesModel().serializeForMsw();
  const license = licenseState.licenses.find((item) => item.slug === 'pro')!;
  const grant = buildGrant({ entitlement: SSO, license, value: true });
  licenseState.entitlements.push(SSO);
  licenseState.pricing.grants.push(grant);
  const licenses = LicenseAppModel.fromSerialized(licenseState);

  // The exception lowers an existing BOOLEAN grant, as in S22-076(b).
  const instanceState = createVouchersInstancesModel().serializeForMsw();
  instanceState.licenseEntitlements.push(grant);
  instanceState.entitlementUsagesByInstance['initech-prod']!.push({
    entitlementId: SSO.id,
    entitlementSlug: 'sso',
    licenseId: license.id,
    licenseSlug: license.slug!,
    source: 'license',
    value: grant.value,
    limit: grant.value,
    provenance: identityProvenance(grant),
  });
  instanceState.entitlementExceptions = {
    catalogue: licenseState.entitlements,
    rows,
  };
  const instances = InstanceAppModel.fromSerialized(instanceState);
  await installInstanceAppMocks(page, instances);
  await installLicenseAppMocks(page, licenses);
  await installBillingAppMocks(
    page,
    new BillingAppModel({
      capabilities: billingCapabilitiesProfiles.disabled('DEPLOYMENT_DISABLED'),
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await signInWithScopes(page, [
    'read:instances',
    'write:instances',
    'read:customers',
    'read:licenses',
    'read:entitlements',
  ]);
});

test('lists every status with filter=all while billing is disabled', async ({
  page,
}) => {
  await install(page, [
    row(),
    row({ id: 'scheduled', startsAt: '2027-01-01T00:00:00Z', endsAt: null }),
    row({
      id: 'expired',
      startsAt: '2026-08-01T00:00:00Z',
      endsAt: '2026-09-01T00:00:00Z',
    }),
    row({ id: 'revoked', revokedAt: '2026-10-02T00:00:00Z' }),
  ]);
  const reads = recordWrites(page, /\/entitlement-exceptions$/, ['GET']);
  await page.goto(BASE);
  await expect(
    page.getByText('Entitlement exceptions', { exact: true }),
  ).toBeVisible();
  for (const status of ['Active', 'Scheduled', 'Expired', 'Ended'])
    await expect(page.getByText(status, { exact: true }).last()).toBeVisible();
  expect(reads.some((read) => read.search === '?filter=all')).toBe(true);
  await expectNoAccessibilityViolations(page);
});

test('creates a BOOLEAN exception with an expiry through a refreshed dialog URL', async ({
  page,
}) => {
  await install(page);
  const writes = recordWrites(page, /\/entitlement-exceptions$/);
  await page.goto(`${BASE}/exceptions/new`);
  await page.reload();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Entitlement', exact: true })
    .click();
  await page.getByRole('option', { name: 'SSO', exact: true }).click();
  await expect(dialog.getByTestId('exception-lowers-warning')).toBeVisible();
  await pickDateTime(
    dialog.getByRole('button', { name: /^Ends at \(UTC\)/ }),
    '2026-11-01T09:00',
  );
  await dialog.getByLabel('Reason', { exact: true }).fill('SSO evaluation');
  await expectNoAccessibilityViolations(page);
  await dialog
    .getByRole('button', { name: 'Create exception', exact: true })
    .click();
  await expect(page).toHaveURL(BASE);
  await expect(page.getByText('SSO evaluation', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.body).toMatchObject({
    entitlementSlug: 'sso',
    kind: 'SET',
    value: false,
    endsAt: '2026-11-01T09:00:00.000Z',
  });
});

test('ends an exception from a deep link and refreshes the effective provenance', async ({
  page,
}) => {
  await install(page, [row()]);
  const writes = recordWrites(page, /\/entitlement-exceptions\/exception-sso$/);
  await page.goto(`${BASE}/exceptions/exception-sso/revoke`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Private evaluation reason');
  await dialog
    .getByRole('button', { name: 'End exception', exact: true })
    .dblclick();
  await expect(page).toHaveURL(BASE);
  await expect(page.getByText('Ended', { exact: true }).last()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Provenance of SSO', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('row').filter({ hasText: 'SSO' }).first(),
  ).toContainText('Enabled');
  expect(writes).toHaveLength(1);
});

test('shows the public exception layer without its private reason', async ({
  page,
}) => {
  await install(page, [row()]);
  await page.goto(BASE);
  await page
    .getByRole('button', { name: 'Provenance of SSO', exact: true })
    .click();
  const layers = page.getByTestId('entitlement-provenance-layers');
  await expect(layers).toContainText('Exception');
  await expect(layers).toContainText('Disabled');
  await expect(layers).not.toContainText('Private evaluation reason');
});
