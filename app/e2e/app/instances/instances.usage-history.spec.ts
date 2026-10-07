import { readFile } from 'node:fs/promises';
import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { expectErrorToast } from '../_support/assertions/toast';
import { UsageHistoryDriver } from '../_support/drivers/usage-history.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  createBillingDisabledModel,
  createSubscriptionsModel,
} from '../billing/billing.scenarios';
import { createBilledInstancesModel } from './instances.scenarios';

// What an instance reported for one of its counters, in the order it was
// accepted, read where the counter is. It belongs to the instances and not to
// billing: it opens with billing off, and it says what the organization keeps.

const READS = /\/usage\/reports$/;

const searchOf = (read: { search?: string }) =>
  new URLSearchParams(read.search ?? '');

test.describe('the usage history of an entitlement', () => {
  test.beforeEach(async ({ page }) => {
    await new UsageHistoryDriver(page).freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
  });

  test('is opened from the row of a counter, shows the first hundred reports in the order they were accepted, and reads the rest on request', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const reads = recordWrites(page, READS, ['GET']);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');

    await expect(page).toHaveURL(/\/entitlements\?history=api-calls$/);
    await expect(history.drawer()).toContainText('Usage history');
    await expect(history.drawer()).toContainText(
      'API Calls on Acme Production',
    );
    await expect(history.count()).toHaveText('100 reports shown');
    await expect(history.rows()).toHaveCount(100);
    await expect(history.rows().first()).toContainText('Append');

    await history.loadMore().click();

    await expect(history.count()).toHaveText('130 reports shown');
    await expect(history.rows()).toHaveCount(130);
    await expect(history.loadMore()).toHaveCount(0);
    // The second page asks for what comes after the last report of the first.
    expect(reads).toHaveLength(2);
    expect(searchOf(reads[0]).has('afterSeq')).toBe(false);
    expect(searchOf(reads[1]).get('afterSeq')).toBe('100');
  });

  test('marks the report where the limit in force changed, and shows what the instance sent with a report', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');

    const changed = history.rows().filter({ hasText: 'Limit changed' });
    await expect(changed).toHaveCount(1);
    await expect(changed).toContainText('150,000');

    await history.propertiesButton(3).click();
    const properties = page.getByRole('dialog', {
      name: 'Properties of report 3',
    });
    await expect(properties).toContainText('eu-west-1');
    await expect(properties).toContainText('sdk');
  });

  test('narrows to a period of days read in UTC, and says so when none was accepted in it', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const reads = recordWrites(page, READS, ['GET']);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await expect(history.drawer()).toContainText(
      'With no period, the last 30 days are shown, as far back as your organization keeps usage.',
    );

    await history.setPeriod('2026-09-20', '2026-09-25');

    // Five days of one report every five hours, from the day they start to the one they end before.
    await expect(history.count()).toHaveText('24 reports shown');
    const last = searchOf(reads.at(-1) ?? {});
    expect(last.get('from')).toBe('2026-09-20T00:00:00.000Z');
    expect(last.get('to')).toBe('2026-09-25T00:00:00.000Z');

    await history.setPeriod('2026-09-01', '2026-09-05');

    await expect(history.empty()).toContainText('No usage reports');
    await expect(history.empty()).toContainText(
      'No report was accepted during this period.',
    );
  });

  test('does not apply a period that ends before it starts, and says so instead of asking the API for it', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const reads = recordWrites(page, READS, ['GET']);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await history.beforeField().fill('2026-09-20');
    await expect(history.count()).toHaveText('50 reports shown');
    const before = reads.length;

    await history.fromField().fill('2026-09-25');

    await expect(
      history.drawer().getByText('The period must end after it starts.'),
    ).toBeVisible();
    expect(reads).toHaveLength(before);
    await expect(history.count()).toHaveText('50 reports shown');
  });

  test('exports every report of the period as a CSV, under a name of its own, and not only the pages that were read', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const exports = recordWrites(page, /\/usage\/reports\/export$/, ['GET']);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await expect(history.count()).toHaveText('100 reports shown');

    const download = page.waitForEvent('download');
    await history.exportButton().click();
    const file = await download;

    // The clock is frozen: the name says the UTC moment of the download.
    expect(file.suggestedFilename()).toBe(
      'usage-acme-production-api-calls-20261007T120000Z.csv',
    );
    const lines = (await readFile((await file.path()) ?? '', 'utf8'))
      .trim()
      .split('\n');
    expect(lines[0]).toContain('report_seq');
    // Only 100 were on screen: the file holds the 130.
    expect(lines).toHaveLength(131);
    expect(searchOf(exports[0]).get('format')).toBe('csv');
  });

  test('exports up to 366 days, and says why the button is disabled for a longer period', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await expect(history.exportButton()).toBeEnabled();

    await history.fromField().fill('2025-06-01');

    await expect(history.exportButton()).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(
      history.drawer().getByTestId('usage-history-export-too-long'),
    ).toContainText(
      'A CSV covers up to 366 days: narrow the period to export it.',
    );
    // It stays reachable by keyboard, with its reason.
    await history.exportButton().focus();
    await expect(history.exportButton()).toBeFocused();

    await history.fromField().fill('2026-01-01');

    await expect(history.exportButton()).toBeEnabled();
  });

  test('shows the refusal of an export as the API wrote it, and stays as it was', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const model = createBilledInstancesModel();
    model.usageHistory.armProblem('exportUsageReports', {
      code: 'ExportUsageReports.RangeTooLarge',
      detail: 'the range spans more than 366 days; split it',
      status: 422,
    });
    await installInstanceAppMocks(page, model);

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await history.exportButton().click();

    await expectErrorToast(
      page,
      'the range spans more than 366 days; split it',
    );
    await expect(history.count()).toHaveText('100 reports shown');
  });

  test('says that the period reaches before what is kept, how long that is, and starts where it begins', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');
    await history.fromField().fill('2025-01-01');

    const notice = history.outsideRetention();
    await expect(notice).toContainText('Beyond your retention of 18 months');
    await expect(notice).toContainText('Apr 7, 2025');
    await expect(history.error()).toHaveCount(0);

    await notice.getByRole('button', { name: 'Show from Apr 8, 2025' }).click();

    await expect(history.outsideRetention()).toHaveCount(0);
    await expect(history.fromField()).toHaveValue('2025-04-08');
    await expect(history.count()).toHaveText('100 reports shown');
  });

  test('shows a refusal in the drawer, with a way to ask again', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const model = createBilledInstancesModel();
    model.usageHistory.armProblem('listUsageReports', {
      code: 'ListUsageReports.Unavailable',
      detail: 'the usage journal is not available right now',
      status: 503,
    });
    await installInstanceAppMocks(page, model);

    await history.gotoEntitlements('acme-production');
    await history.link('API Calls').click();

    await expect(history.error()).toContainText(
      'the usage journal is not available right now',
    );
    await history.error().getByRole('button', { name: 'Retry' }).click();

    await expect(history.count()).toHaveText('100 reports shown');
  });
});

test.describe('the address of the usage history', () => {
  test.beforeEach(async ({ page }) => {
    await new UsageHistoryDriver(page).freezeTime();
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('opens the drawer when it is linked to, and is closed by its button and by the back button', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);

    await history.gotoEntitlements('acme-production', '?history=api-calls');

    await expect(history.drawer()).toBeVisible();
    await expect(history.count()).toHaveText('100 reports shown');
    await history.close();
    await expect(page).toHaveURL(/\/entitlements$/);

    await history.open('API Calls');
    await page.goBack();

    await expect(history.drawer()).toHaveCount(0);
    await expect(page).toHaveURL(/\/entitlements$/);
  });

  test('carries the period in the address: a link opens the history for it, a reload keeps it, and closing the drawer takes it away', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    const reads = recordWrites(page, READS, ['GET']);

    await history.gotoEntitlements(
      'acme-production',
      '?history=api-calls&from=2026-09-20T00:00:00.000Z&to=2026-09-25T00:00:00.000Z',
    );

    // Opened on the period the link names, in what it asked and in the fields.
    await expect(history.count()).toHaveText('24 reports shown');
    expect(searchOf(reads[0]).get('from')).toBe('2026-09-20T00:00:00.000Z');
    expect(searchOf(reads[0]).get('to')).toBe('2026-09-25T00:00:00.000Z');
    await expect(history.fromField()).toHaveValue('2026-09-20');
    await expect(history.beforeField()).toHaveValue('2026-09-25');

    // Another period is written to the address, without piling up history entries.
    await history.setPeriod('2026-09-10', '2026-09-15');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('from'))
      .toBe('2026-09-10T00:00:00.000Z');
    expect(new URL(page.url()).searchParams.get('to')).toBe(
      '2026-09-15T00:00:00.000Z',
    );
    expect(new URL(page.url()).searchParams.get('history')).toBe('api-calls');

    await page.reload();

    await expect(history.drawer()).toBeVisible();
    await expect(history.fromField()).toHaveValue('2026-09-10');
    await expect(history.beforeField()).toHaveValue('2026-09-15');

    await history.close();
    await expect(page).toHaveURL(/\/entitlements$/);
  });

  test('opens nothing for a counter the instance does not have, and leaves the page as it is', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);

    await history.gotoEntitlements(
      'acme-production',
      '?history=no-such-counter',
    );

    await expect(history.link('API Calls')).toBeVisible();
    await expect(history.drawer()).toHaveCount(0);
  });

  test('is offered for a counter and not for a flag', async ({ page }) => {
    const history = new UsageHistoryDriver(page);

    await history.gotoEntitlements('acme-production');

    await expect(history.link('API Calls')).toBeVisible();
    await expect(history.link('Storage GB')).toBeVisible();
    await expect(history.link('SSO')).toHaveCount(0);
  });
});

test.describe('the usage history where billing is off', () => {
  test('opens all the same, and does not know how long usage is kept', async ({
    page,
  }) => {
    const history = new UsageHistoryDriver(page);
    await history.freezeTime();
    await installBillingAppMocks(
      page,
      createBillingDisabledModel('DEPLOYMENT_DISABLED'),
    );
    await installInstanceAppMocks(page, createBilledInstancesModel());

    await history.gotoEntitlements('acme-production');
    await history.open('API Calls');

    await expect(history.count()).toHaveText('100 reports shown');

    await history.fromField().fill('2025-01-01');

    await expect(history.outsideRetention()).toContainText(
      'Beyond what your organization keeps',
    );
    await expect(history.outsideRetention()).toContainText('Apr 7, 2025');
  });
});
