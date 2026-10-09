import {
  expect,
  expectErrorToast,
  expectToast,
  recordWrites,
  test,
} from '../_support/app-test';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { BILLED_NOW } from './billed-instances';
import { createStripeBillingModel } from './billing.scenarios';

// What a person does to an invoice that Stripe collects. Pushing it again only puts it
// back in the queue, so the page watches for the result every five seconds for two
// minutes; reading it back applies what happened in Stripe (a payment, a void, a
// finalization); a draft Stripe holds for review is finalized at once; and voiding goes
// through Stripe first. The clock of the page is the test's: a minute is `runFor`.

const PUSHES = /\/api\/invoices\/[^/]+\/retry-push$/;
const SYNCS = /\/api\/invoices\/[^/]+\/sync$/;
const VOIDS = /\/api\/invoices\/[^/]+\/void$/;

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(BILLED_NOW) });
});

test.describe('pushing an invoice to Stripe again', () => {
  test('queues a push that failed, says so, and watches until Stripe has the invoice', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, PUSHES);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-f1');
    await invoice.expectActions(['Retry push', 'Void']);
    await invoice.action('Retry push').click();

    await expectToast(
      page,
      'Push requested. Kaiten checks again every few seconds.',
    );
    expect(writes).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: '/api/invoices/inv-f1/retry-push',
      },
    ]);
    await expect(invoice.pushStatus()).toHaveAttribute('data-phase', 'waiting');
    await expect(invoice.pushStatus()).toContainText('Pushing to Stripe…');
    // It is queued, not pushed: the invoice is what it was, and cannot be pushed twice.
    await expect(invoice.statusBadge()).toHaveText('Push failed');
    await expect(invoice.action('Retry push')).toBeDisabled();

    await page.clock.runFor(5_000);

    await expectToast(page, 'Stripe has the invoice');
    await expect(invoice.pushStatus()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Awaiting payment');
    await expect(invoice.pushError()).toHaveCount(0);
    await expect(invoice.providerLinks()).toBeVisible();
    await invoice.expectActions(['Read from Stripe', 'Void']);
  });

  test('stops when the push ran and failed again, and says what Stripe answered', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({
        pushFailures: { 'inv-f1': 'customer_tax_location_invalid' },
      }),
    );

    await invoice.goto('inv-f1');
    await invoice.action('Retry push').click();
    await expect(invoice.pushStatus()).toHaveAttribute('data-phase', 'waiting');
    await page.clock.runFor(5_000);

    await expectErrorToast(page, 'The push failed again');
    await expect(
      page
        .locator('[data-sonner-toast][data-type="error"]')
        .filter({ hasText: 'customer_tax_location_invalid' }),
    ).toBeVisible();
    await expect(invoice.pushStatus()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Push failed');
    await expect(invoice.pushError()).toContainText('4 attempts.');
    // It can be asked again, now that the attempt is over.
    await expect(invoice.action('Retry push')).toBeEnabled();
  });

  test('pushes a draft the queue has not got to yet, and gives up waiting after two minutes, leaving it queued', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const reads = recordWrites(page, /\/api\/invoices\/inv-q1$/, ['GET']);
    await installBillingAppMocks(
      page,
      createStripeBillingModel({ stalledPushes: ['inv-q1'] }),
    );

    await invoice.goto('inv-q1');
    await invoice.expectActions(['Push now', 'Void']);
    await invoice.action('Push now').click();
    await expect(invoice.pushStatus()).toHaveAttribute('data-phase', 'waiting');

    await page.clock.runFor(119_000);
    await expect(invoice.pushStatus()).toHaveAttribute('data-phase', 'waiting');
    // Every five seconds in the 119 that passed, besides the page's own reads.
    const readsSoFar = reads.length;
    expect(readsSoFar).toBeGreaterThanOrEqual(23);

    await page.clock.runFor(1_000);

    await expect(invoice.pushStatus()).toHaveAttribute('data-phase', 'expired');
    await expect(invoice.pushStatus()).toContainText('Still queued');
    await expect(invoice.statusBadge()).toHaveText('Draft');
    // The queue keeps trying by itself: the page stops asking, and can be asked again.
    await expect(invoice.action('Push now')).toBeEnabled();
    const readsAtTheEnd = reads.length;
    await page.clock.runFor(60_000);
    expect(reads.length).toBeLessThanOrEqual(readsAtTheEnd + 1);
  });

  test('is shown as the API refused it, in its own words, and the invoice does not move', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createStripeBillingModel();
    model.invoices.armProblem('retryPush', {
      code: 'RetryInvoicePush.Held',
      detail: 'a held invoice is released or recomposed before it is pushed',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-f1');
    await invoice.action('Retry push').click();

    await expectErrorToast(
      page,
      'a held invoice is released or recomposed before it is pushed',
    );
    await expect(invoice.pushStatus()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Push failed');
  });

  test('is a Stripe that cannot be reached, said as nothing changed, with a way to ask again that starts the watch', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, PUSHES);
    const model = createStripeBillingModel();
    model.invoices.armProblem('retryPush', {
      code: 'RetryInvoicePush.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-f1');
    await invoice.action('Retry push').click();

    const refusal = page
      .locator('[data-sonner-toast][data-type="error"]')
      .filter({ hasText: 'the payment provider could not be reached' });
    await expect(refusal).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    await expect(invoice.statusBadge()).toHaveText('Push failed');
    await expect(invoice.pushStatus()).toHaveCount(0);
    await refusal.getByRole('button', { name: 'Retry' }).click();

    await expectToast(
      page,
      'Push requested. Kaiten checks again every few seconds.',
    );
    expect(writes).toHaveLength(2);
    await expect(invoice.pushStatus()).toHaveAttribute('data-phase', 'waiting');
  });

  test('is not offered to a session that may only read billing', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-f1');

    await expect(invoice.pushError()).toBeVisible();
    await invoice.expectActions([]);
  });
});

test.describe('finalizing a draft that Stripe holds for review', () => {
  test('finalizes it at once, sends no body, and has nothing to wait for', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, PUSHES);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-rv');
    await expect(invoice.awaitingFinalization()).toBeVisible();
    await invoice.action('Finalize in Stripe').click();

    await expectToast(page, 'Invoice finalized in Stripe');
    expect(writes).toEqual([
      {
        body: null,
        method: 'POST',
        pathname: '/api/invoices/inv-rv/retry-push',
      },
    ]);
    await expect(invoice.awaitingFinalization()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Awaiting payment');
    await expect(invoice.pushStatus()).toHaveCount(0);
    await expect(invoice.providerLinks()).toBeVisible();
  });

  test('voids it by deleting the draft in Stripe, and offers to recompose it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, VOIDS);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-rv');
    await invoice.action('Void').click();
    await expect(invoice.dialog()).toContainText(
      'The invoice is voided at your payment provider first, then here.',
    );
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expectToast(page, 'Invoice voided');
    expect(writes[0].body).toEqual({ reason: 'wrong amount' });
    await expect(invoice.statusBadge()).toHaveText('Void');
    await invoice.expectActions(['Recompose']);
  });
});

test.describe('reading an invoice back from Stripe', () => {
  test('applies a payment made on the hosted page: the invoice is paid, and nothing is left to do with it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, SYNCS);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-pp');
    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await invoice.action('Read from Stripe').click();

    await expectToast(page, 'Invoice read from Stripe: it is paid');
    expect(writes).toEqual([
      { body: null, method: 'POST', pathname: '/api/invoices/inv-pp/sync' },
    ]);
    await expect(invoice.statusBadge()).toHaveText('Paid');
    await invoice.expectActions([]);
  });

  test('refreshes an invoice that nothing happened to', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-s1');
    await invoice.action('Read from Stripe').click();

    await expectToast(page, 'Invoice read from Stripe');
    await expect(invoice.statusBadge()).toHaveText('Awaiting payment');
    await expect(invoice.provider()).toContainText('Last read from Stripe');
  });

  test('is a Stripe that cannot be reached, said as nothing changed, with a way to read again, and the badge unchanged', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, SYNCS);
    const model = createStripeBillingModel();
    model.invoices.armProblem('syncInvoice', {
      code: 'SyncInvoice.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-pp');
    await invoice.action('Read from Stripe').click();

    const refusal = page
      .locator('[data-sonner-toast][data-type="error"]')
      .filter({ hasText: 'the payment provider could not be reached' });
    await expect(refusal).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    // No optimistic reading: it is not paid until the API says so.
    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await refusal.getByRole('button', { name: 'Retry' }).click();

    await expectToast(page, 'Invoice read from Stripe: it is paid');
    expect(writes).toHaveLength(2);
    await expect(invoice.statusBadge()).toHaveText('Paid');
  });

  test("is a refusal in the API's words when Stripe does not have the invoice", async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createStripeBillingModel();
    model.invoices.armProblem('syncInvoice', {
      code: 'SyncInvoice.NotPushed',
      detail: 'the invoice is not in a payment provider',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-s1');
    await invoice.action('Read from Stripe').click();

    await expectErrorToast(page, 'the invoice is not in a payment provider');
  });
});

test.describe('voiding an invoice that Stripe collects', () => {
  test('voids it in Stripe first and then here, and offers to recompose it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, VOIDS);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-mm');
    await invoice.action('Void').click();
    await expect(invoice.dialog()).toContainText(
      'The invoice is voided at your payment provider first, then here. This cannot be undone.',
    );
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expectToast(page, 'Invoice voided');
    expect(writes[0].body).toEqual({ reason: 'wrong amount' });
    await expect(invoice.statusBadge()).toHaveText('Void');
    await expect(
      invoice.provider().locator('[data-provider-status]'),
    ).toHaveText('Void');
    await invoice.expectActions(['Recompose']);
  });

  test('keeps the status when Stripe cannot be reached, shows the detail with a way to ask again, and voids when it is', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, VOIDS);
    const model = createStripeBillingModel();
    model.invoices.armProblem('voidInvoice', {
      code: 'VoidInvoice.ProviderUnavailable',
      detail: 'the payment provider answered 503',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-mm');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expect(
      invoice.dialog().getByText('the payment provider answered 503'),
    ).toBeVisible();
    await expect(invoice.dialog()).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await invoice
      .dialog()
      .getByRole('button', { name: 'Retry', exact: true })
      .click();

    await expectToast(page, 'Invoice voided');
    await expect(invoice.statusBadge()).toHaveText('Void');
    await invoice.expectActions(['Recompose']);
    expect(writes).toHaveLength(2);
  });

  test('reads the payment at once when Stripe reports the invoice paid: one read, the invoice is paid, and no error is said', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const voids = recordWrites(page, VOIDS);
    const syncs = recordWrites(page, SYNCS);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-pp');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expectToast(page, 'Not voided: Stripe reports this invoice as paid.');
    await expectToast(page, 'Invoice read from Stripe: it is paid');
    await expect(invoice.dialog()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Paid');
    await invoice.expectActions([]);
    expect(voids).toHaveLength(1);
    expect(syncs).toEqual([
      { body: null, method: 'POST', pathname: '/api/invoices/inv-pp/sync' },
    ]);
    await expect(
      page.locator('[data-sonner-toast][data-type="error"]'),
    ).toHaveCount(0);
  });

  test('stays with the refusal and a button when that read fails, and reads again when asked', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const syncs = recordWrites(page, SYNCS);
    const model = createStripeBillingModel();
    model.invoices.armProblem('syncInvoice', {
      code: 'SyncInvoice.ProviderUnavailable',
      detail: 'the payment provider could not be reached',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-pp');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expect(invoice.voidPaidAtProvider()).toContainText(
      'Stripe reports this invoice as paid',
    );
    await expect(invoice.dialog()).toContainText(
      'the payment provider reports this invoice paid',
    );
    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await invoice
      .voidPaidAtProvider()
      .getByRole('button', { name: 'Read it from Stripe' })
      .click();

    await expectToast(page, 'Invoice read from Stripe: it is paid');
    await expect(invoice.dialog()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Paid');
    expect(syncs).toHaveLength(2);
  });
});
