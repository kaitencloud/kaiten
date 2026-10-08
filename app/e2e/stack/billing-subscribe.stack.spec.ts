import { expect, test } from '@playwright/test';
import { BillingSettingsDriver } from '../app/_support/drivers/billing-settings.driver';
import { InstanceBillingDriver } from '../app/_support/drivers/instance-billing.driver';
import { InstancesListDriver } from '../app/_support/drivers/instances-list.driver';
import { UsageHistoryDriver } from '../app/_support/drivers/usage-history.driver';
import { accepted, api, headers, signIn } from './stack-api';
import { setUpBillable } from './stack-billable';

// What a person does with billing from the console, against the real API: the
// rules only the server owns (how far back a subscription may start, what keeps
// an instance from being deleted, how long usage is kept, the bounds of the
// payment terms) answered by the API itself, and what the console writes read
// back from it. Under Mock Service Worker the console reads what the mock was
// told to say; here nothing is told.

test('subscribes an instance from the console ten days back, sets the billing e-mail of its customer from the dialog, and keeps the instance from being deleted while it bills', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const billable = await setUpBillable(request, suffix);
  const email = `ap-${suffix}@subscribed.test`;
  // Ten days ago, to the minute, as the field that takes a start in UTC writes it.
  const startAt = new Date(Date.now() - 10 * 86_400_000);
  startAt.setUTCSeconds(0, 0);

  await signIn(page);
  const billing = new InstanceBillingDriver(page);
  await billing.goto(billable.instanceSlug);
  await expect(billing.notSubscribed()).toBeVisible();
  await billing.openSubscribe();

  // The customer has no billing e-mail: the dialog says so, and sets it without
  // being left or submitted.
  await expect(billing.billingEmailNotice()).toContainText(
    `${billable.customerName} has no billing e-mail`,
  );
  await billing.billingEmailField().fill(email);
  await billing.billingEmailNotice().getByRole('button').click();
  await expect(billing.billingEmailNotice()).toHaveCount(0);

  await billing.daysUntilDueField().fill('45');
  await billing.setStartAt(startAt.toISOString().slice(0, 16));
  await billing.confirmButton().click();

  await expect(billing.started()).toBeVisible();
  await expect(billing.started()).toContainText('$29.00');

  // What the API holds is what was typed.
  const subscription = await accepted<{
    daysUntilDueOverride?: number;
    startedAt: string;
    status: string;
  }>(
    await request.get(`${api}/api/instances/${billable.instanceSlug}/billing`, {
      headers,
    }),
    200,
  );
  expect(subscription.status).toBe('ACTIVE');
  expect(subscription.daysUntilDueOverride).toBe(45);
  expect(Date.parse(subscription.startedAt)).toBe(startAt.getTime());
  const customer = await accepted<{ billingEmail?: string }>(
    await request.get(`${api}/api/customers/${billable.customerSlug}`, {
      headers,
    }),
    200,
  );
  expect(customer.billingEmail).toBe(email);

  // Behind the dialog, the tab shows the subscription and its first invoice.
  await billing.close();
  await expect(billing.subscriptionCard()).toContainText('Active');
  await expect(billing.subscriptionCard()).toContainText(
    'Payable within 45 days',
  );
  await expect(billing.invoiceRows()).toHaveCount(1);

  // An instance that bills is kept: the API refuses, and the console says what
  // stands in the way, with the way to it.
  const list = new InstancesListDriver(page);
  await list.goto();
  await list.openDeleteDialog(billable.instanceName);
  await page.getByRole('button', { name: 'Confirm' }).click();

  const refusal = page.getByRole('dialog', {
    name: 'This instance cannot be deleted',
  });
  await expect(refusal).toContainText(
    `Instance "${billable.instanceSlug}" is billed`,
  );
  await expect(refusal.getByTestId('deletion-refusal')).toContainText('Active');
  // Its activation invoice is not settled yet, and the refusal lists it.
  await expect(refusal).toContainText('1 invoice not settled');
  await expect(
    refusal.getByTestId('deletion-refusal-invoices').getByRole('listitem'),
  ).toHaveCount(1);
  await refusal.getByRole('link', { name: 'Open the subscription' }).click();

  await expect(page).toHaveURL(
    new RegExp(`/customers/instances/${billable.instanceSlug}/billing$`),
  );
});

test('saves the defaults of the organization and reads them back, and refuses a number of days the API would refuse before it sends anything', async ({
  page,
  request,
}) => {
  await signIn(page);
  const settings = new BillingSettingsDriver(page);
  const writes: string[] = [];
  page.on('request', (sent) => {
    if (
      sent.method() === 'PUT' &&
      sent.url().endsWith('/api/billing/settings')
    ) {
      writes.push(sent.url());
    }
  });
  await settings.goto();
  await expect(settings.daysField()).toHaveValue('30');
  await expect(settings.retention()).toContainText(/\d+ months/);

  // The API holds 0 to 365, and so does the field: it says so, in words.
  await settings.daysField().fill('366');
  await settings.daysField().blur();
  await expect(settings.defaults()).toContainText(
    'Enter a whole number of days, from 0 to 365',
  );
  await expect(settings.saveButton()).toBeDisabled();
  expect(writes).toHaveLength(0);

  try {
    await settings.daysField().fill('45');
    await settings.saveButton().click();
    await expect(
      page.getByText('Billing defaults saved').first(),
    ).toBeVisible();

    const saved = await accepted<{ defaultDaysUntilDue: number }>(
      await request.get(`${api}/api/billing/settings`, { headers }),
      200,
    );
    expect(saved.defaultDaysUntilDue).toBe(45);
    await page.reload();
    await expect(settings.daysField()).toHaveValue('45');
  } finally {
    // The organization is left with the terms it had.
    await accepted(
      await request.put(`${api}/api/billing/settings`, {
        data: {
          defaultCollectionMethod: 'SEND_INVOICE',
          defaultDaysUntilDue: 30,
          handoffStripeInvoices: false,
        },
        headers,
      }),
      200,
    );
  }
});

test('reads the usage history of an entitlement from the real journal, tells what lies beyond the retention, and exports what it shows', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const meteredSlug = `calls-${suffix}`;
  const billable = await setUpBillable(request, suffix, meteredSlug);
  for (const [index, value] of [10, 20, 30].entries()) {
    await accepted(
      await request.post(
        `${api}/api/instances/${billable.instanceSlug}/entitlements/${meteredSlug}/usage`,
        {
          data: {
            behavior: 'append',
            transactionId: `${suffix}-${index}`,
            value: { type: 'number', value },
          },
          headers,
        },
      ),
      200,
    );
  }

  await signIn(page);
  const history = new UsageHistoryDriver(page);
  await history.gotoEntitlements(
    billable.instanceSlug,
    `?history=${meteredSlug}`,
  );
  await expect(history.drawer()).toBeVisible();

  await expect(history.rows()).toHaveCount(3);
  await expect(history.rows()).toHaveCount(3);
  // The counter goes from report to report: 0 to 10, 10 to 30, 30 to 60.
  await expect(history.rows().nth(0)).toContainText('0 → 10');
  await expect(history.rows().nth(2)).toContainText('30 → 60');

  const exported = page.waitForEvent('download');
  await history.exportButton().click();
  const download = await exported;
  expect(download.suggestedFilename()).toMatch(/^usage-.*\.csv$/);
  const lines: string[] = [];
  for await (const chunk of await download.createReadStream()) {
    lines.push(...String(chunk).split('\n').filter(Boolean));
  }
  // A header, and one row for each report.
  expect(lines).toHaveLength(4);

  // A period that begins before what the organization keeps: the API refuses it
  // and says where what is kept begins, and the console offers to start there.
  await page.goto(
    `/customers/instances/${billable.instanceSlug}/entitlements?history=${meteredSlug}&from=2020-01-01T00:00:00.000Z`,
  );
  await expect(history.outsideRetention()).toContainText(
    /Beyond your retention of \d+ months/,
  );
  await history.outsideRetention().getByRole('button').click();

  await expect(history.rows()).toHaveCount(3);
  await expect
    .poll(() => new URL(page.url()).searchParams.get('from'))
    .toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
});
