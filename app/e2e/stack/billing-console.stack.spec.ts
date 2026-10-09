import { expect, test } from '@playwright/test';
import { BillingHandoffDriver } from '../app/_support/drivers/billing-handoff.driver';
import { BillingInvoicesDriver } from '../app/_support/drivers/billing-invoices.driver';
import { InvoiceDetailDriver } from '../app/_support/drivers/invoice-detail.driver';
import { accepted, api, headers, signIn } from './stack-api';

// The invoices of the console against the real API: what only a real closing can
// prove. Under Mock Service Worker the console reads what the mock was told to
// say; here the API composes the invoices itself, at the boundaries of a
// subscription whose customer was renamed in between, and the console shows them.
// Nothing in the console starts a closing, so the spec asks for one through the
// API, as the period-close job does on its own pass.

/** The instant a month before `now`, as the API reads "at most one billing period ago", plus a margin. */
function aMonthAgo(now: Date, marginSeconds: number): Date {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - 1);
  start.setUTCSeconds(start.getUTCSeconds() + marginSeconds);
  start.setUTCMilliseconds(0);

  return start;
}

test('bills a renamed customer under each name it had at the boundary, and settles the renewal from the console', async ({
  page,
  request,
}) => {
  // A month before the 29th, 30th or 31st does not fall on a day that month has:
  // a subscription cannot start a whole period ago, and nothing is due to close.
  test.skip(
    new Date().getUTCDate() > 28,
    'a month ago is not a day on the 29th, 30th and 31st: no period can be due',
  );
  test.setTimeout(180_000);

  const suffix = Date.now().toString(36);
  const customerSlug = `renamed-${suffix}`;
  const instanceSlug = `renamed-instance-${suffix}`;
  const licenseSlug = `renamed-license-${suffix}`;
  const firstName = `Initech ${suffix}`;
  const secondName = `Initech Systems ${suffix}`;

  // The setup: a customer on a published license that sells a monthly flat fee.
  const customer = await accepted<{ id: string }>(
    await request.post(`${api}/api/customers`, {
      data: { name: firstName, slug: customerSlug },
      headers,
    }),
  );
  const license = await accepted<{ id: string }>(
    await request.post(`${api}/api/licenses`, {
      data: {
        description: 'The license of the renamed customer',
        isDefault: false,
        lifecycleState: 'DRAFT',
        name: `Renamed ${suffix}`,
        slug: licenseSlug,
        type: 'PAID',
      },
      headers,
    }),
  );
  const price = await accepted<{ id: string }>(
    await request.post(`${api}/api/licenses/${licenseSlug}/prices`, {
      data: {
        billingModel: 'FLAT_FEE',
        billingPeriod: 'MONTHLY',
        currency: 'USD',
        displayLabel: 'Pro, monthly',
        unitAmountDecimal: '2900',
      },
      headers,
    }),
  );
  await accepted(
    await request.post(`${api}/api/licenses/${licenseSlug}/publish`, {
      headers,
    }),
    200,
  );
  const now = new Date();
  await accepted(
    await request.post(`${api}/api/instances`, {
      data: {
        customerId: customer.id,
        description: 'The instance of the renamed customer',
        endLicenseDate: new Date(
          now.getTime() + 365 * 86_400_000,
        ).toISOString(),
        licenseId: license.id,
        name: `Renamed instance ${suffix}`,
        slug: instanceSlug,
        startLicenseDate: now.toISOString(),
      },
      headers,
    }),
  );

  // Subscribed a period ago (the API accepts nothing earlier): the first period
  // ends within seconds, and the base fee bills in advance, so the activation
  // invoice is there at once, under the name the customer has now.
  const startAt = aMonthAgo(now, 20);
  await accepted(
    await request.post(`${api}/api/instances/${instanceSlug}/billing`, {
      data: { basePriceId: price.id, startAt: startAt.toISOString() },
      headers,
    }),
  );

  // The customer is renamed between the two boundaries.
  await accepted(
    await request.put(`${api}/api/customers/${customerSlug}`, {
      data: { name: secondName },
      headers,
    }),
    204,
  );

  // Once the period has ended, a closing composes its renewal, under the name the
  // customer has by then. Nothing is due before: asking again is harmless.
  await expect
    .poll(
      async () => {
        const closed = await request.post(`${api}/api/billing/close-periods`, {
          data: { instanceSlug },
          headers,
        });
        expect(closed.status()).toBe(200);

        return ((await closed.json()) as { closed: number }).closed;
      },
      {
        intervals: [3_000],
        message: 'the period never became due',
        timeout: 90_000,
      },
    )
    .toBe(1);

  // What the console shows is what the API composed.
  await signIn(page);
  const list = new BillingInvoicesDriver(page);
  await list.goto(`?instanceSlug=${instanceSlug}`);

  await expect(list.rows()).toHaveCount(2);
  const activation = list.rows().filter({ hasText: 'Activation' });
  const renewal = list.rows().filter({ hasText: 'Renewal' });
  await expect(activation).toContainText(firstName);
  await expect(activation).not.toContainText(secondName);
  await expect(activation).toContainText('$29.00');
  await expect(renewal).toContainText(secondName);
  await expect(renewal).toContainText('$29.00');
  // Issued with no payment provider behind them: ready to bill, and in the queue.
  await expect(renewal).toContainText('Ready to bill');
  await expect(renewal).toContainText('Waiting for your ERP');

  // An invoice is billed to whom the customer was when it was composed.
  const invoice = new InvoiceDetailDriver(page);
  await activation.getByRole('link').first().click();
  await expect(invoice.title()).toContainText('Activation invoice');
  await expect(invoice.identity()).toContainText(firstName);
  await expect(invoice.identity()).not.toContainText(secondName);
  await expect(invoice.line('Pro, monthly')).toContainText('$29.00');

  await list.goto(`?instanceSlug=${instanceSlug}`);
  await list
    .rows()
    .filter({ hasText: 'Renewal' })
    .getByRole('link')
    .first()
    .click();
  await expect(invoice.title()).toContainText('Renewal invoice');
  await expect(invoice.identity()).toContainText(secondName);
  await expect(invoice.identity()).not.toContainText(firstName);
  await invoice.expectActions(['Mark as paid', 'Write off', 'Void']);

  // Settled by hand, with the number the accounting system gave it: paid, and
  // acknowledged in the queue under that number.
  await invoice.action('Mark as paid').click();
  await invoice.dialog().getByLabel('External reference').fill('ERP-1');
  await invoice.confirm('Mark as paid').click();
  await expect(invoice.statusBadge()).toHaveText('Paid');
  await invoice.expectActions([]);
  await expect(invoice.handoff()).toContainText('ERP-1');

  const handoff = new BillingHandoffDriver(page);
  await handoff.goto('ACKNOWLEDGED');
  await expect(handoff.rows().filter({ hasText: secondName })).toContainText(
    'ERP-1',
  );
  await expect(handoff.rows().filter({ hasText: firstName })).toHaveCount(0);
});
