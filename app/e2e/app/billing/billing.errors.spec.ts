import { expect, test } from '../_support/app-test';
import { BillingNavDriver } from '../_support/drivers/billing-nav.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { createInvoicesModel } from './billing.scenarios';

// How the screens of the invoices show what the API refuses with: its own words,
// the trace of a failure that is the server's, a banner that names a scope the
// session lacks, and a way to ask again where asking again may work. The console
// around the screen keeps working, and nothing is shown as changed that was not.

const detailError = (page: import('@playwright/test').Page) =>
  page.getByTestId('billing-route-error');

test.describe('an invoice the API refuses to give', () => {
  test('shows why, with the trace of a failure that is the server’s, and reads again when asked', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('getInvoice', {
      detail: 'the invoice store is unavailable',
      errorId: 'trace-invoice-1',
      status: 500,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/invoices/inv-m1');

    await expect(detailError(page)).toContainText(
      'the invoice store is unavailable',
    );
    await expect(detailError(page)).toContainText('Reference trace-invoice-1');
    // The console around it still works.
    await expect(new BillingNavDriver(page).entry('Invoices')).toBeVisible();

    await detailError(page).getByRole('button', { name: 'Retry' }).click();

    await expect(invoice.title()).toBeVisible();
    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await expect(detailError(page)).toHaveCount(0);
  });

  test('says nothing was changed when the API cannot be reached, and offers to ask again', async ({
    page,
  }) => {
    const model = createInvoicesModel();
    model.invoices.armProblem('getInvoice', {
      detail: 'the billing service is restarting',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/invoices/inv-m1');

    await expect(detailError(page)).toContainText(
      'the billing service is restarting',
    );
    await expect(detailError(page)).toContainText(
      'Nothing was changed. You can try again.',
    );
    await expect(
      detailError(page).getByRole('button', { name: 'Retry' }),
    ).toBeVisible();
  });

  test('names the scope a session lacks, with how a token carries it, and offers no retry', async ({
    page,
  }) => {
    const model = createInvoicesModel();
    model.invoices.armProblem('getInvoice', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: read:billing',
      status: 403,
    });
    await installBillingAppMocks(page, model);

    await page.goto('/invoices/inv-m1');

    await expect(detailError(page)).toContainText('read:billing');
    await expect(detailError(page)).toContainText(
      'token template of your identity provider',
    );
    await expect(
      detailError(page).getByRole('button', { name: 'Retry' }),
    ).toHaveCount(0);
    // No blank page: the navigation is there.
    await expect(new BillingNavDriver(page).entry('Invoices')).toBeVisible();
  });

  test('is a page that does not exist where the API does not know the invoice, and says where to go', async ({
    page,
  }) => {
    await installBillingAppMocks(page, createInvoicesModel());

    await page.goto('/invoices/inv-nope');

    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(detailError(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to Invoices' }).click();
    await expect(page).toHaveURL(/\/invoices$/);
  });
});

test.describe('the refusals of an action', () => {
  test('keep the invoice as it was: nothing is shown before the API says it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('writeOff', {
      detail: 'the invoice store is unavailable',
      errorId: 'trace-write-1',
      status: 500,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-m1');
    await invoice.action('Write off').click();
    await invoice.confirmWithReason('Write off', 'customer bankrupt');

    await expect(
      invoice.dialog().getByText('the invoice store is unavailable'),
    ).toBeVisible();
    await expect(
      invoice.dialog().getByText('Reference trace-write-1'),
    ).toBeVisible();
    await expect(invoice.statusBadge()).toHaveText('Overdue');
    await invoice.expectActions(['Mark as paid', 'Write off', 'Void']);
  });

  test('name the scope a session lacks, in the dialog that asked', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('voidInvoice', {
      code: 'Auth.MissingScope',
      detail: 'missing required scope: write:billing',
      status: 403,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-m1');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expect(invoice.dialog()).toContainText('write:billing');
    await expect(invoice.dialog()).toContainText(
      'token template of your identity provider',
    );
    await expect(
      invoice.dialog().getByRole('button', { name: 'Retry' }),
    ).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Overdue');
  });
});
