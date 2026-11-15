import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { AiUsageDriver } from '../_support/drivers/ai-usage.driver';
import { installAiWorldMocks } from '../_support/mocks/install-ai-app-mocks';
import { createAiWorldModels } from './ai.scenarios';

// Refunding part of a charge from its receipt (txn_acme_017: 78.50 charged,
// 30.00 refunded already). The refund is sent once with an idempotency key,
// the receipt lists it, and the pool's balance is read again. In the mock world
// a successful write remounts the AI screens: the test waits on the final state.

const ACME = 'acme-production';
const REFUND =
  /^\/api\/instances\/acme-production\/entitlements\/ai-credits\/usage\/inferences\/txn_acme_017\/refund$/;

test.describe('refunding a charge', () => {
  test('refunds part of what is left, lists it, and lowers the pool’s consumption', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels());
    const usage = new AiUsageDriver(page);
    const writes = recordWrites(page, REFUND);
    await usage.goto(ACME);
    await expect(usage.poolFigure('Consumed')).toHaveText('183,420.50');

    await usage.openReceipt('txn_acme_017');
    await expect(usage.section('Refunds')).toContainText(
      'Refunded 30.00 of 78.50 credits. 48.50 credits are left to refund.',
    );
    await usage.receiptButton('Refund 48.50 credits…').click();

    const dialog = usage.refundDialog();
    const amount = dialog.getByRole('textbox', { name: 'Credits to refund' });
    // Everything left, by default.
    await expect(amount).toHaveValue('48.5');
    await amount.fill('8.5');
    await dialog
      .getByRole('textbox', { name: 'Reason' })
      .fill('Timeout on our side');
    const sent = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        REFUND.test(new URL(request.url()).pathname),
    );
    await dialog.getByRole('button', { name: 'Refund', exact: true }).click();
    expect((await sent).headers()['idempotency-key']).toBeTruthy();

    await expectToast(page, 'Refunded 8.50 credits.');
    await expect(usage.section('Refunds')).toContainText(
      'Refunded 38.50 of 78.50 credits.',
    );
    await expect(usage.section('Refunds')).toContainText('Timeout on our side');
    await expect(usage.receiptButton('Refund 40.00 credits…')).toBeVisible();
    expect(writes).toEqual([
      {
        body: expect.objectContaining({
          credits: '8.5',
          reason: 'Timeout on our side',
        }),
        method: 'POST',
        pathname:
          '/api/instances/acme-production/entitlements/ai-credits/usage/inferences/txn_acme_017/refund',
      },
    ]);

    await usage.closeReceipt();
    await expect(usage.poolFigure('Consumed')).toHaveText('183,412.00');
  });

  test('refuses more than what is left, and sends nothing', async ({
    page,
  }) => {
    await installAiWorldMocks(page, createAiWorldModels());
    const usage = new AiUsageDriver(page);
    const writes = recordWrites(page, REFUND);
    await usage.goto(ACME, '?receipt=txn_acme_017');

    await usage.receiptButton('Refund 48.50 credits…').click();
    const dialog = usage.refundDialog();
    await dialog.getByRole('textbox', { name: 'Credits to refund' }).fill('50');

    await expect(dialog).toContainText(
      'This is more than what is left to refund.',
    );
    await expect(
      dialog.getByRole('button', { name: 'Refund', exact: true }),
    ).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('says why when the instance no longer holds the pool, and keeps the dialog open', async ({
    page,
  }) => {
    await installAiWorldMocks(
      page,
      createAiWorldModels({
        flag: 'on',
        poolsNoLongerGranted: ['acme-production/ai-credits'],
      }),
    );
    const usage = new AiUsageDriver(page);
    await usage.goto(ACME, '?receipt=txn_acme_003');

    await usage.receiptButton('Refund 1.38 credits…').click();
    const dialog = usage.refundDialog();
    await dialog.getByRole('button', { name: 'Refund', exact: true }).click();

    await expect(dialog).toContainText(
      'This instance no longer holds this credit pool, so the refund cannot be counted.',
    );
    await expect(dialog).toBeVisible();
    await expect(usage.section('Refunds')).toHaveCount(0);
  });
});
