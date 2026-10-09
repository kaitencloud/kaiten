import { buildProviderRecord } from '../_support/fixtures/build-invoice';
import { expect, test } from '../_support/app-test';
import { readConsoleStorage } from '../_support/assertions/storage';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { BillingAppModel } from '../_support/model/billing-app-model';
import { billingCapabilitiesProfiles } from '../_support/model/billing-capabilities';
import { BILLED_NOW } from './billed-instances';
import {
  createInvoicesModel,
  createStripeBillingModel,
} from './billing.scenarios';
import { stripeInvoice } from './stripe-fixtures';

// An invoice that Stripe collects shows, besides what Kaiten composed, where it stands
// in Stripe: its status there, its number and identifiers, when it was pushed and read
// back, the pages Stripe hosts for it, how its amounts compare, and what a person has to
// do with it (a push that failed, a draft to finalize, a charge that needs the customer).
// Every field is the provider's record as the API mirrors it, and an invoice nobody
// collects through a provider has no such block: it is absent, not empty.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

test.describe('where an invoice stands in Stripe', () => {
  test('says its status there, its number and identifiers, who collects it and how', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-s1');

    await expect(invoice.providerBadge()).toHaveText('Stripe');
    await expect(invoice.statusBadge()).toHaveText('Awaiting payment');
    const card = invoice.provider();
    await expect(card).toContainText('Payment provider');
    await expect(card).toContainText(
      'Stripe charges the payment method on file when the invoice is due.',
    );
    await expect(card.locator('[data-provider-status]')).toHaveText('Open');
    await expect(card).toContainText('in_s1');
    await expect(card).toContainText('cus_initech');
    await expect(card.locator('[data-reconciliation]')).toHaveText('Match');
    await expect(invoice.reconciliation()).toContainText(
      'Stripe holds the same amounts as Kaiten.',
    );
  });

  test('says an invoice that is sent says so, and not that it is charged', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-pp');

    await expect(invoice.provider()).toContainText(
      'Stripe sends the invoice to the customer and collects the payment.',
    );
  });

  test('is absent, not empty, for an invoice nobody collects through a provider', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-p1');

    await expect(invoice.providerBadge()).toHaveText('Manual');
    await expect(invoice.provider()).toHaveCount(0);
    await expect(invoice.reconciliation()).toHaveCount(0);
    await expect(invoice.pushError()).toHaveCount(0);
    await expect(invoice.awaitingFinalization()).toHaveCount(0);
    await expect(invoice.paymentError()).toHaveCount(0);
  });

  test('says an invoice was not pushed yet when Stripe does not have it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-q1');

    await expect(invoice.provider()).toContainText(
      'Stripe does not have this invoice yet.',
    );
    await expect(invoice.providerLinks()).toHaveCount(0);
  });
});

test.describe('the pages Stripe hosts for an invoice', () => {
  test('are links that open a tab of their own with no access to the console', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-s1');

    const hosted = invoice.providerLinks().getByRole('link', {
      name: 'Hosted invoice',
    });
    const pdf = invoice.providerLinks().getByRole('link', { name: 'PDF' });
    await expect(hosted).toHaveAttribute(
      'href',
      'https://invoice.stripe.com/i/acct_1/in_s1',
    );
    await expect(pdf).toHaveAttribute(
      'href',
      'https://pay.stripe.com/invoice/acct_1/in_s1/pdf',
    );
    for (const link of [hosted, pdf]) {
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  test('are read from the API each time: kept in no storage of the browser and said to no console', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const logged: string[] = [];
    page.on('console', (message) => logged.push(message.text()));
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-s1');
    await expect(invoice.providerLinks()).toBeVisible();
    // The very addresses the page shows, so that nothing short of them counts.
    const hrefs = await invoice
      .providerLinks()
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? ''),
      );
    expect(hrefs.filter(Boolean)).toHaveLength(2);

    const stored = await readConsoleStorage(page);
    const said = logged.join('\n');
    for (const href of hrefs) {
      expect(stored).not.toContain(href);
      expect(said).not.toContain(href);
    }
    expect(stored).not.toContain('in_s1');
  });

  test('are not links at all unless the address is https', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);
    const unsafe = stripeInvoice('inv-bad', {
      provider: buildProviderRecord({
        externalInvoiceId: 'in_bad',
        hostedInvoiceUrl: 'javascript:alert(1)',
        invoicePdfUrl: 'http://pay.stripe.com/invoice/in_bad/pdf',
        pushedAt: '2026-04-01T00:06:00.000Z',
      }),
    });
    await installBillingAppMocks(
      page,
      new BillingAppModel({
        capabilities: billingCapabilitiesProfiles.stackWithStripe('connected'),
        invoices: [unsafe],
      }),
    );

    await invoice.goto('inv-bad');

    await expect(invoice.provider()).toBeVisible();
    await expect(invoice.providerLinks()).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="http://pay.stripe.com"]')).toHaveCount(
      0,
    );
  });
});

test.describe('how the amounts of an invoice compare with those of Stripe', () => {
  test('says which differ, with the two totals as each side states them and the line Stripe has alone', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-mm');

    const reconciliation = invoice.reconciliation();
    await expect(reconciliation).toContainText('Reconciliation');
    await expect(
      reconciliation.locator('[data-reconciliation="MISMATCH"]'),
    ).toHaveText('Differ');
    await expect(reconciliation).toContainText(
      'Stripe holds amounts that are not the ones Kaiten composed.',
    );
    await expect(reconciliation).toContainText('Total composed by Kaiten');
    await expect(reconciliation).toContainText('$33.19');
    await expect(reconciliation).toContainText(
      'Total in Stripe, excluding tax',
    );
    await expect(reconciliation).toContainText('$34.19');
    await expect(reconciliation).toContainText(
      'Lines Stripe has that Kaiten did not compose',
    );
    await expect(reconciliation).toContainText('ii_9');
    await expect(
      invoice.provider().locator('[data-reconciliation]'),
    ).toHaveText('Differ');
  });

  test('says when Stripe applied a discount Kaiten never created, such as a coupon added in its dashboard', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const odd = stripeInvoice('inv-cp', {
      provider: buildProviderRecord({
        externalInvoiceId: 'in_cp',
        pushedAt: '2026-04-01T00:06:00.000Z',
        reconciliationDetail: {
          discounts: [],
          extraDiscounts: [
            {
              amount: -500,
              discountId: 'di_coupon',
              externalLineId: 'il_77',
            },
          ],
          extraInProvider: [],
          inclusiveTax: false,
          lines: [],
          missingInProvider: [],
          totals: { kaitenTotal: 2900, providerTotalExcludingTax: 2400 },
        },
        reconciliationStatus: 'MISMATCH',
        total: 2400,
      }),
    });
    await installBillingAppMocks(
      page,
      new BillingAppModel({
        capabilities: billingCapabilitiesProfiles.stackWithStripe('connected'),
        invoices: [odd],
      }),
    );

    await invoice.goto('inv-cp');

    await expect(invoice.reconciliation()).toContainText(
      'Discounts Stripe applied that Kaiten did not create',
    );
    await expect(invoice.reconciliation()).toContainText('di_coupon');
    await expect(invoice.reconciliation()).toContainText('il_77');
    await expect(invoice.reconciliation()).toContainText('Such as a coupon');
  });
});

test.describe('what a person has to do with an invoice that Stripe collects', () => {
  test('says a push failed, how many times, what Stripe answered and when the next attempt is', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-f1');

    await expect(invoice.statusBadge()).toHaveText('Push failed');
    const error = invoice.pushError();
    await expect(error).toContainText('The push to Stripe failed');
    await expect(error).toContainText(
      'customer_tax_location_invalid: the customer address cannot be used to compute tax',
    );
    await expect(error).toContainText('3 attempts.');
    await expect(error).toContainText('Next attempt:');
    await invoice.expectActions(['Retry push', 'Void']);
  });

  test('says a draft is awaiting finalization in Stripe, offers to finalize it or void it, and shows no link, handoff or due date', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-rv');

    await expect(invoice.statusBadge()).toHaveText('Draft');
    await expect(invoice.awaitingFinalization()).toContainText(
      'Awaiting finalization in Stripe',
    );
    // Stripe has the draft: it can also be read back, once someone finalized it there.
    await invoice.expectActions([
      'Finalize in Stripe',
      'Read from Stripe',
      'Void',
    ]);
    await expect(invoice.providerLinks()).toHaveCount(0);
    await expect(invoice.handoff()).toHaveCount(0);
    await expect(invoice.stat('Due')).toContainText('Not issued');
  });

  test('says what the customer must do when a charge failed', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createStripeBillingModel());

    await invoice.goto('inv-pf');

    await expect(invoice.statusBadge()).toHaveText('Payment failed');
    await expect(invoice.paymentError()).toContainText(
      'Stripe could not collect the payment',
    );
    await expect(invoice.paymentError()).toContainText(
      'The customer must confirm the payment on the hosted invoice page.',
    );
    await expect(invoice.paymentError()).toContainText(
      'authentication_required',
    );
  });

  test('says nothing of a push to an invoice that was pushed', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    await invoice.goto('inv-s1');

    await expect(invoice.pushError()).toHaveCount(0);
    await expect(invoice.awaitingFinalization()).toHaveCount(0);
    await expect(invoice.pushStatus()).toHaveCount(0);
  });
});
