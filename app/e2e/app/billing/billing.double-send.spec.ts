import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import {
  delayRequests,
  pressTwiceInOneFrame,
} from '../_support/assertions/requests';
import { BillingSettingsDriver } from '../_support/drivers/billing-settings.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createBilledInstancesModel } from '../instances/instances.scenarios';
import { BILLED_NOW } from './billed-instances';
import {
  createInvoicesModel,
  createStripeBillingModel,
  createSubscriptionsModel,
} from './billing.scenarios';

// A button that waits on the state of its request waits on what was painted, which is a
// frame after the click: two presses made before that frame are two requests. These specs
// press twice in the same task, with the API slowed so that the first request is still out,
// and want one request, one toast and one file.

const PUSHES = /\/api\/invoices\/[^/]+\/retry-push$/;
const SYNCS = /\/api\/invoices\/[^/]+\/sync$/;
const RECOMPOSES = /\/api\/invoices\/[^/]+\/recompose$/;
const ORGANIZATION_EXPORTS = /\/api\/usage\/reports\/export$/;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

test.describe('pressing an action of an invoice twice in the same frame', () => {
  test('pushes the invoice again once', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, PUSHES);
    await installBillingAppMocks(page, createStripeBillingModel());
    await delayRequests(page, { ms: 800, pathname: PUSHES });

    await invoice.goto('inv-f1');
    await pressTwiceInOneFrame(invoice.action('Retry push'));

    await expectToast(
      page,
      'Push requested. Kaiten checks again every few seconds.',
    );
    expect(writes).toHaveLength(1);
  });

  test('reads the invoice back from Stripe once', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, SYNCS);
    await installBillingAppMocks(page, createStripeBillingModel());
    await delayRequests(page, { ms: 800, pathname: SYNCS });

    await invoice.goto('inv-s1');
    await pressTwiceInOneFrame(invoice.action('Read from Stripe'));

    await expectToast(page, 'Invoice read from Stripe');
    expect(writes).toHaveLength(1);
  });

  test('recomposes a void invoice once, and lands on its replacement', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, RECOMPOSES);
    await installBillingAppMocks(page, createInvoicesModel());
    await delayRequests(page, { ms: 800, pathname: RECOMPOSES });

    await invoice.goto('inv-v2');
    await invoice.action('Recompose').click();
    await pressTwiceInOneFrame(
      invoice
        .alertDialog()
        .getByRole('button', { name: 'Recompose', exact: true }),
    );

    await expectToast(page, 'Replacement invoice composed');
    expect(writes).toHaveLength(1);
  });
});

test.describe('pressing the export of a month twice in the same frame', () => {
  test('asks for one file', async ({ page }) => {
    const settings = new BillingSettingsDriver(page);
    await installInstanceAppMocks(page, createBilledInstancesModel());
    const exports = recordWrites(page, ORGANIZATION_EXPORTS, ['GET']);
    await installBillingAppMocks(page, createSubscriptionsModel());
    await delayRequests(page, {
      methods: ['GET'],
      ms: 800,
      pathname: ORGANIZATION_EXPORTS,
    });

    await settings.gotoSettings();
    const download = page.waitForEvent('download');
    await pressTwiceInOneFrame(settings.monthButton('September 2026'));
    await download;

    await expect(settings.monthButton('September 2026')).toBeEnabled();
    expect(exports).toHaveLength(1);
  });
});
