import { expect, test } from '@playwright/test';
import { InstanceBillingDriver } from '../app/_support/drivers/instance-billing.driver';
import { InstanceLifecycleDriver } from '../app/_support/drivers/instance-lifecycle.driver';
import { InvoiceDetailDriver } from '../app/_support/drivers/invoice-detail.driver';
import { accepted, api, headers, signIn } from './stack-api';
import { setUpBillable } from './stack-billable';

// The life of a subscription from the console, against the real API: what only the
// server owns, which Mock Service Worker is told and the stack is not. An invoice
// carries the names of the instance and of the customer as they are when it is
// issued, so the final invoice of a subscription whose customer was renamed while it
// billed carries the new name, and the invoice issued before the rename keeps the old.

type InvoiceRow = { customerName: string; id: string; kind: string };

test('cancels at once the subscription of a customer renamed while it billed, and the final invoice carries the new name', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const billable = await setUpBillable(request, suffix);
  const renamed = `Renamed ${suffix}`;

  // A subscription on the price of the license, which issues its activation invoice.
  const [price] = await accepted<Array<{ id: string }>>(
    await request.get(`${api}/api/licenses/${billable.licenseSlug}/prices`, {
      headers,
    }),
    200,
  );
  await accepted(
    await request.post(
      `${api}/api/instances/${billable.instanceSlug}/billing`,
      { data: { basePriceId: price.id, providerKind: 'NOOP' }, headers },
    ),
  );
  // The customer is renamed while it bills.
  await accepted(
    await request.put(`${api}/api/customers/${billable.customerSlug}`, {
      data: { name: renamed, slug: billable.customerSlug },
      headers,
    }),
    204,
  );

  await signIn(page);
  const billing = new InstanceBillingDriver(page);
  const lifecycle = new InstanceLifecycleDriver(page);
  await billing.goto(billable.instanceSlug);
  await expect(billing.subscriptionCard()).toContainText('Active');
  await lifecycle.openCancel(billable.instanceName);

  await lifecycle.chooseCancelMode('Immediately');
  await lifecycle.reasonField().fill('The contract ended');
  await lifecycle.cancelConfirmButton().click();

  // The API ended it at once and issued the final invoice, which the dialog leads to.
  await expect(lifecycle.canceled()).toContainText('Subscription canceled');
  await expect(lifecycle.canceled()).toContainText('Final invoice:');
  const subscription = await accepted<{
    cancellationReason?: string;
    status: string;
  }>(
    await request.get(`${api}/api/instances/${billable.instanceSlug}/billing`, {
      headers,
    }),
    200,
  );
  expect(subscription.status).toBe('CANCELED');
  expect(subscription.cancellationReason).toBe('The contract ended');

  await lifecycle
    .canceled()
    .getByRole('link', { name: 'View the invoice' })
    .click();

  await expect(page).toHaveURL(/\/billing\/invoices\/[^/]+$/);
  const invoice = new InvoiceDetailDriver(page);
  await expect(invoice.title()).toContainText('Final invoice');
  await expect(invoice.identity()).toContainText(renamed);
  await expect(invoice.identity()).not.toContainText(billable.customerName);

  // The invoice issued before the rename is as it was issued.
  const { items } = await accepted<{ items: InvoiceRow[] }>(
    await request.get(
      `${api}/api/instances/${billable.instanceSlug}/invoices`,
      { headers },
    ),
    200,
  );
  expect(
    items
      .map(({ customerName, kind }) => ({ customerName, kind }))
      .sort((left, right) => left.kind.localeCompare(right.kind)),
  ).toEqual([
    { customerName: billable.customerName, kind: 'ACTIVATION' },
    { customerName: renamed, kind: 'FINAL' },
  ]);

  // Back on the tab: an ended subscription, with the two invoices it issued.
  await billing.goto(billable.instanceSlug);
  await expect(billing.subscriptionCard()).toContainText('Canceled');
  await expect(lifecycle.actions()).toHaveCount(0);
  await expect(billing.invoiceRows()).toHaveCount(2);
});
