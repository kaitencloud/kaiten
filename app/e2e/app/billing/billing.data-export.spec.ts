import { readFile } from 'node:fs/promises';
import { expect, recordWrites, test } from '../_support/app-test';
import { expectErrorToast } from '../_support/assertions/toast';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { createBilledInstancesModel } from '../instances/instances.scenarios';
import { BILLED_NOW } from './billed-instances';
import {
  createBillingDisabledModel,
  createSubscriptionsModel,
} from './billing.scenarios';

// Deleting an organization erases what billing recorded for it, and Kaiten is not
// its accounting system. Before that, the settings offer the invoices and the usage
// as files: the usage a month to a file, since one export reads 31 days at most.
// The usage is the instances' and not billing's, so it is offered with billing off.

const ORGANIZATION_EXPORTS = /\/api\/usage\/reports\/export$/;

const searchOf = (read: { search?: string }) =>
  new URLSearchParams(read.search ?? '');

test.describe('the export of the data of the organization', () => {
  // Each test installs the instances, so that one can arm them first.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
  });

  test('offers the invoices and the usage to keep, on the page of the settings', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();

    await expect(settings.exportCard()).toContainText('Export your data');
    await expect(settings.exportCard()).toContainText(
      'Deleting an organization erases what billing recorded for it',
    );
    await expect(settings.invoicesExport()).toContainText(
      'Every invoice of the organization, with its lines.',
    );
    await expect(settings.usageExport()).toContainText(
      'Kaiten keeps 18 months of usage.',
    );
  });

  test('lists the months the organization keeps, the current one first', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();

    // The month the page is in and the 18 before it.
    await expect(settings.months()).toHaveCount(19);
    await expect(settings.months().first()).toContainText('October 2026');
    await expect(settings.months().last()).toContainText('April 2025');
  });

  test('exports a month of the usage of every instance as a CSV, under a name of its own', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());
    const exports = recordWrites(page, ORGANIZATION_EXPORTS, ['GET']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();
    const download = page.waitForEvent('download');
    await settings.monthButton('September 2026').click();
    const file = await download;

    expect(file.suggestedFilename()).toBe('usage-2026-09-20261007T120000Z.csv');
    const query = searchOf(exports[0]);
    expect(query.get('from')).toBe('2026-09-01T00:00:00.000Z');
    // Up to the first instant of the next month, which the API leaves out.
    expect(query.get('to')).toBe('2026-10-01T00:00:00.000Z');
    expect(query.get('format')).toBe('csv');
    const lines = (await readFile((await file.path()) ?? '', 'utf8'))
      .trim()
      .split('\n');
    expect(lines[0]).toContain('report_seq');
    // 103 of the 130 reports of the journal were accepted in September.
    expect(lines).toHaveLength(104);
  });

  test('reads the oldest month from where the kept usage begins, once the API says where that is', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());
    const exports = recordWrites(page, ORGANIZATION_EXPORTS, ['GET']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();
    const download = page.waitForEvent('download');
    await settings.monthButton('April 2025').click();
    const file = await download;

    // The retention is told in months and not to the day: the month begins before it.
    expect(exports).toHaveLength(2);
    expect(searchOf(exports[0]).get('from')).toBe('2025-04-01T00:00:00.000Z');
    expect(searchOf(exports[1]).get('from')).toBe('2025-04-07T12:00:00.000Z');
    expect(file.suggestedFilename()).toBe('usage-2025-04-20261007T120000Z.csv');
    const lines = (await readFile((await file.path()) ?? '', 'utf8'))
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1);
  });

  test('shows the refusal of an export as the API wrote it, and offers the months again', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    const instances = createBilledInstancesModel();
    instances.usageHistory.armProblem('exportOrganizationUsageReports', {
      code: 'ExportUsageReports.Unavailable',
      detail: 'the usage journal is not available right now',
      status: 503,
    });
    await installInstanceAppMocks(page, instances);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();
    await settings.monthButton('September 2026').click();

    await expectErrorToast(
      page,
      'the usage journal is not available right now',
    );
    await expect(settings.monthButton('September 2026')).toBeEnabled();
  });

  test('exports the invoices of the organization, with no filter', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());
    const exports = recordWrites(page, /\/api\/invoices\/export$/, ['GET']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();
    await settings
      .invoicesExport()
      .getByRole('button', { name: 'Export' })
      .click();
    const download = page.waitForEvent('download');
    await page
      .getByRole('menuitem', { exact: true, name: 'CSV by invoice' })
      .click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(
      /^invoices-by-invoice-\d{8}T\d{6}Z\.csv$/,
    );
    const query = searchOf(exports[0]);
    expect([...query.keys()].sort()).toEqual(['format', 'granularity']);
    const csv = await readFile((await file.path()) ?? '', 'utf8');
    expect(csv).toContain('inv-acme-renewal');
  });
});

test.describe('the export of the data where billing is not there', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(BILLED_NOW));
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('offers the usage and not the invoices where billing is off, and lists two years of months when the retention is not told', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );

    await settings.gotoSettings();

    await expect(settings.exportCard()).toBeVisible();
    await expect(settings.invoicesExport()).toHaveCount(0);
    await expect(settings.usageExport()).toContainText(
      'The last 24 months are listed; an older period is exported through the API.',
    );
    await expect(settings.months()).toHaveCount(25);
  });

  test('offers only the invoices to a session that may read billing and not the instances', async ({
    page,
  }) => {
    const settings = new BillingSettingsDriver(page);
    await signInWithScopes(
      page,
      SESSION_SCOPES.reader.filter((scope) => scope !== 'read:instances'),
    );
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();

    await expect(settings.invoicesExport()).toBeVisible();
    await expect(settings.usageExport()).toHaveCount(0);
  });

  test('is absent for a session that may export neither', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    await signInWithScopes(page, ['read:customers']);
    await installBillingAppMocks(page, createSubscriptionsModel());

    await settings.gotoSettings();

    await expect(settings.exportCard()).toHaveCount(0);
  });
});
