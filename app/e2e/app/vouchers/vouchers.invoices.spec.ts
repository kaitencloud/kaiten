import { expect, test } from '../_support/app-test';
import { BillingInvoicesDriver } from '../_support/drivers/billing-invoices.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createInvoicesModel } from '../billing/billing.scenarios';
import { installVouchersWorld } from './install-vouchers-world';
import { createVouchersInvoicesModel } from './vouchers.invoices.scenarios';

// A discount takes its place on an invoice as a DISCOUNT line, and the invoice says how
// it was composed from the members the API records on the line: what it takes, which
// invoice of its redemption this is out of how many, and what each line it discounts
// bears of it. The console reads all of it and works none of it out; the label of the
// line, which a person may have written anything in, is never read for it.

test.describe('the invoice a discount was applied to', () => {
  test('says how the discount of a code redeemed with the subscription was composed, and what it took off the total', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const invoice = new InvoiceDetailDriver(page);
    await billing.freezeTime();
    await installVouchersWorld(page);
    await billing.goto('initech-fresh');

    await billing.openSubscribe();
    await billing.trialDaysField().fill('0');
    await billing
      .dialog()
      .getByLabel(/^Voucher code/)
      .fill('WELCOME-SPRING-2027');
    await billing.confirmButton().click();
    await expect(billing.started()).toContainText('Activation invoice: $79.20');
    await billing
      .started()
      .getByRole('link', { name: 'View the invoice' })
      .click();

    await expect(invoice.title()).toContainText('Activation invoice');
    await expect(invoice.stat('Total')).toContainText('$79.20');
    await expect(invoice.stat('Total')).toContainText(
      '2 lines, after $19.80 of discounts',
    );
    await expect(invoice.lines()).toHaveCount(2);
    const discount = invoice.line('Welcome spring');
    await expect(discount).toContainText('Discount');
    await expect(discount).toContainText('−$19.80');
    const how = discount.getByTestId('invoice-line-discount');
    await expect(how).toContainText('20% of $99.00');
    await expect(how).toContainText('Invoice 1 of 3 for this redemption');
    await expect(how).toContainText('Bears on Pro, monthly ($19.80)');
    // The totals are the API's: the subtotal, what the discounts took, and what is due.
    const totals = invoice.totals().getByTestId('invoice-totals');
    await expect(totals).toContainText('$99.00');
    await expect(totals).toContainText('−$19.80');
    await expect(totals).toContainText('$79.20');
  });

  test('is listed with what the discounts took off its total', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const invoices = new BillingInvoicesDriver(page);
    await billing.freezeTime();
    await installVouchersWorld(page);
    await billing.goto('initech-fresh');
    await billing.openSubscribe();
    await billing.trialDaysField().fill('0');
    await billing
      .dialog()
      .getByLabel(/^Voucher code/)
      .fill('WELCOME-SPRING-2027');
    await billing.confirmButton().click();
    await expect(billing.started()).toBeVisible();

    await invoices.goto();

    await expect(invoices.rows()).toHaveCount(1);
    await expect(invoices.rows().first()).toContainText('$79.20');
    await expect(invoices.rows().first()).toContainText(
      'After $19.80 of discounts',
    );
  });
});

test.describe('the invoice the next boundary will issue', () => {
  test('is composed with the discounts of the redemptions the instance holds, one invoice further on than the last', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await billing.freezeTime();
    await installVouchersWorld(page);

    await billing.goto('initech-annual');

    // The welcome discount was used on the invoice of March: this is the second of three.
    await expect(billing.upcomingCard()).toContainText('$792.00');
    await billing.viewLinesButton().click();
    const preview = page.getByRole('dialog', { name: 'Upcoming invoice' });
    const how = preview.getByTestId('invoice-line-discount');
    await expect(how).toContainText('20% of $990.00');
    await expect(how).toContainText('Invoice 2 of 3 for this redemption');
    await expect(how).toContainText('Bears on Pro, annual ($198.00)');
    await expect(preview).toContainText('−$198.00');
    await expect(preview).toContainText('Subtotal');
    await expect(preview).toContainText('$990.00');
    await expect(preview).toContainText('$792.00');
  });

  test('has none for an instance whose redemption was revoked', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await billing.freezeTime();
    await installVouchersWorld(page);
    await billing.goto('initech-annual');
    await page.getByRole('button', { name: /^Revoke Welcome spring/ }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Reason/)
      .fill('mistake');
    await page
      .getByRole('dialog')
      .getByRole('button', { exact: true, name: 'Revoke' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(billing.upcomingCard()).toContainText('$990.00');
    await billing.viewLinesButton().click();
    const preview = page.getByRole('dialog', { name: 'Upcoming invoice' });
    await expect(preview.getByTestId('invoice-line-discount')).toHaveCount(0);
    await expect(preview).not.toContainText('Welcome spring');
  });
});

test.describe('an invoice of the past', () => {
  test('says a discount in dollars off two lines, on a redemption with no end, from the members of its line', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createVouchersInvoicesModel());

    await invoice.goto('inv-hooli-credit');

    await expect(invoice.stat('Total')).toContainText('$35.00');
    await expect(invoice.stat('Total')).toContainText(
      '3 lines, after $15.00 of discounts',
    );
    const how = invoice
      .line('Hooli agreement')
      .getByTestId('invoice-line-discount');
    await expect(how).toContainText('$15.00 off $50.00');
    await expect(how).toContainText('Invoice 4 for this redemption');
    // No end: there is no count to say it is out of.
    await expect(how).not.toContainText('Invoice 4 of');
    await expect(how).toContainText(
      'Bears on Starter, monthly ($12.00) and Extra seats · 2026 ($3.00)',
    );
  });

  test('says nothing of a discount where the invoice has none', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createVouchersInvoicesModel());

    await invoice.goto('inv-hooli-plain');

    await expect(invoice.stat('Total')).toContainText('$50.00');
    await expect(invoice.stat('Total')).not.toContainText('of discounts');
    await expect(page.getByTestId('invoice-line-discount')).toHaveCount(0);
  });

  test('is listed with what the discounts took off, and an invoice with none is listed as it was', async ({
    page,
  }) => {
    const invoices = new BillingInvoicesDriver(page);
    await installBillingAppMocks(page, createVouchersInvoicesModel());

    await invoices.goto();

    await expect(invoices.row('inv-hooli-credit')).toContainText('$35.00');
    await expect(invoices.row('inv-hooli-credit')).toContainText(
      'After $15.00 of discounts',
    );
    await expect(invoices.row('inv-hooli-plain')).toContainText('$50.00');
    await expect(invoices.row('inv-hooli-plain')).not.toContainText(
      'of discounts',
    );
  });

  test('leaves a discount line with no composition recorded as it came: its label and its description, never a guess', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');

    // The label says 20%; nothing records how this line was composed.
    await expect(invoice.line('Welcome −20%')).toContainText('−$5.80');
    await expect(invoice.line('Welcome −20%')).toContainText('20% of $29.00');
    await expect(
      invoice.line('Welcome −20%').getByTestId('invoice-line-discount'),
    ).toHaveCount(0);
  });
});
