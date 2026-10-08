import { expect, recordWrites, test } from '../_support/app-test';
import { expectFitsItsContainer } from '../_support/assertions/layout';
import { expectToast } from '../_support/assertions/toast';
import { BillingHandoffDriver } from '../_support/drivers/billing-handoff.driver';
import { InvoiceDetailDriver } from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import {
  createEmptyInvoicesModel,
  createInvoicesModel,
  createLongHandoffQueueModel,
} from './billing.scenarios';

// The queue the organization's accounting system reads: the invoices issued with
// no payment provider behind them, oldest first, as they wait to be booked and
// once they were. A job or the CLI takes them; the console shows where that
// stands, and lets a person acknowledge one they booked by hand. The console reads
// every invoice of the part of the queue it shows, 200 at a time, and searches,
// filters, sorts and pages them itself like any other list; the URL holds the part
// of the queue alone.

// Issued, oldest first: the replacement of a void invoice, the first invoice,
// the renewal and Globex's.
const WAITING = ['inv-r1', 'inv-m1', 'inv-p1', 'inv-g1'];
// Written off in December, then paid in January and in February.
const ACKNOWLEDGED = ['inv-u1', 'inv-d2', 'inv-d1'];

test.describe('the queue of what waits', () => {
  test('keeps all its columns within a laptop, with a lease on one invoice and under the other tab', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());
    await page.setViewportSize({ height: 800, width: 1280 });

    await handoff.goto();

    await expect(handoff.rows()).toHaveCount(4);
    await expect(handoff.row('inv-p1')).toContainText('Reserved until');
    await expectFitsItsContainer(page.getByRole('table').first());

    await handoff.showTab('Acknowledged');

    await expect(handoff.rows()).toHaveCount(3);
    await expectFitsItsContainer(page.getByRole('table').first());
  });

  test('lists the invoices oldest first, with how many times each was taken', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();

    await handoff.expectInvoiceIds(WAITING);
    await expect(handoff.rows()).toHaveCount(4);
    await expect(handoff.row('inv-r1')).toContainText('0 claims');
    await expect(handoff.row('inv-m1')).toContainText('1 claim');
    await expect(handoff.row('inv-p1')).toContainText('2 claims');
    await expect(handoff.row('inv-g1')).toContainText('0 claims');
  });

  test('shows who each invoice is for, what it bills, what it comes to and when it was issued', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();

    const row = handoff.row('inv-p1');
    await expect(row).toContainText('Initech');
    await expect(row).toContainText('initech-prod');
    await expect(row).toContainText('Renewal');
    await expect(row).toContainText('Apr 1, 2026 (UTC)');
    await expect(row).toContainText('$27.39');
    // When it was issued: the day, and under it the time.
    await expect(row).toContainText('Apr 1, 2026 (UTC)');
    await expect(row).toContainText('12:04 AM (UTC)');
  });

  test('shows the status of each invoice, and a void invoice that still waits: its consumer sees it as void', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await expect(
      page.getByRole('columnheader', { exact: true, name: 'Status' }),
    ).toBeVisible();
    await expect(handoff.row('inv-p1')).toContainText('Ready to bill');

    // Voiding leaves a handoff that was pending pending: the queue still holds it.
    await invoice.goto('inv-p1');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong boundary');
    await expect(invoice.statusBadge()).toHaveText('Void');
    await expect(invoice.handoff()).toContainText(
      'void and its handoff stays pending',
    );
    await expect(invoice.handoff()).not.toContainText(
      'A job or the CLI takes it from the queue',
    );

    await handoff.goto();
    await handoff.expectInvoiceIds(WAITING);
    await expect(handoff.row('inv-p1')).toContainText('Void');
    await expect(handoff.row('inv-p1')).not.toContainText('Ready to bill');
  });

  test('says until when a consumer holds an invoice, while its lease has not run out', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();

    // Taken a quarter of an hour ago, by a consumer that holds it still.
    await expect(handoff.row('inv-p1')).toContainText('Reserved until');
    // The lease of the first invoice ran out long ago: it can be taken again.
    await expect(handoff.row('inv-m1')).not.toContainText('Reserved until');
    await expect(page.getByText(/Reserved until/)).toHaveCount(1);
  });

  test('offers no way to claim an invoice: that is the consumer’s, not a person’s', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.expectInvoiceIds(WAITING);

    await expect(handoff.claimButtons()).toHaveCount(0);
  });

  test('leads each row to its invoice', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.row('inv-g1').getByRole('link').first().click();

    await expect(page).toHaveURL(/\/billing\/invoices\/inv-g1$/);
  });

  test('teaches the command that takes what waits when nothing does', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createEmptyInvoicesModel());

    await handoff.goto();

    await expect(handoff.empty()).toContainText(
      'Nothing is waiting for your ERP',
    );
    await expect(handoff.empty()).toContainText('kaiten billing handoff claim');
    await expect(handoff.claimButtons()).toHaveCount(0);
  });

  test('sorts by the column whose header is pressed, and opens oldest issue first', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.expectInvoiceIds(WAITING);

    // Two claims is the most: a number sorts the biggest first.
    await handoff.sortBy('Claims');
    await handoff.expectInvoiceIds(['inv-p1', 'inv-m1', 'inv-r1', 'inv-g1']);

    await handoff.sortBy('Claims');
    await handoff.expectInvoiceIds(['inv-r1', 'inv-g1', 'inv-m1', 'inv-p1']);
  });

  test('reads every invoice of the queue, 200 at a time, then pages them ten to a page, oldest first', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const reads = recordWrites(page, /\/api\/billing\/handoff$/, ['GET']);
    await installBillingAppMocks(page, createLongHandoffQueueModel());

    await handoff.goto();

    await expect(handoff.rows()).toHaveCount(10);
    expect((await handoff.invoiceIds())[0]).toBe('inv-queue-01');
    await expect(page.getByText('Showing 1-10 of 55 records')).toBeVisible();
    expect(reads).toHaveLength(1);
    expect(new URLSearchParams(reads[0].search).get('status')).toBe('PENDING');
    expect(new URLSearchParams(reads[0].search).get('limit')).toBe('200');
    await expect(
      page.getByRole('button', { name: 'Load more', exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByText('Showing 11-20 of 55 records')).toBeVisible();
    expect((await handoff.invoiceIds())[0]).toBe('inv-queue-11');
    // Nothing more was asked of the API: the pages are the browser's.
    expect(reads).toHaveLength(1);
  });

  test('keeps every page of a queue longer than the one the API sends', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const reads = recordWrites(page, /\/api\/billing\/handoff$/, ['GET']);
    await installBillingAppMocks(page, createLongHandoffQueueModel(230));

    await handoff.goto();

    await expect(page.getByText('Showing 1-10 of 230 records')).toBeVisible();
    expect(reads).toHaveLength(2);
    expect(new URLSearchParams(reads[0].search).has('cursor')).toBe(false);
    expect(new URLSearchParams(reads[1].search).get('cursor')).toBeTruthy();
    expect(new URLSearchParams(reads[1].search).get('limit')).toBe('200');
  });
});

test.describe('the search and the filters of the queue', () => {
  test('find an invoice by who it is for or by its identifier, in the browser', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const reads = recordWrites(page, /\/api\/billing\/handoff$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.search('GLOBEX');
    await handoff.expectInvoiceIds(['inv-g1']);

    await handoff.search('initech-pr');
    await handoff.expectInvoiceIds(['inv-r1', 'inv-m1', 'inv-p1']);

    await handoff.search('inv-p');
    await handoff.expectInvoiceIds(['inv-p1']);

    // The console holds the queue: nothing more was asked of the API, and the URL
    // does not carry the search.
    expect(reads).toHaveLength(1);
    expect(new URL(page.url()).search).toBe('');
  });

  test('find an invoice by the number the accounting system booked it under', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto('?status=ACKNOWLEDGED');
    await handoff.search('erp-09');

    await handoff.expectInvoiceIds(['inv-d2']);
  });

  test('narrow the queue by the status and the kind of its invoices, and say each one in a chip', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const reads = recordWrites(page, /\/api\/billing\/handoff$/, ['GET']);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.addFilter('Kind');
    await handoff.pick('Activation');
    await handoff.expectInvoiceIds(['inv-r1', 'inv-m1']);

    await handoff.addFilter('Overdue');
    await handoff.pick('True');
    await handoff.expectInvoiceIds(['inv-r1', 'inv-m1']);

    await handoff.expectChips(['Kind: Activation', 'Overdue: True']);
    expect(reads).toHaveLength(1);
    expect(new URL(page.url()).search).toBe('');

    await handoff.removeFilter('Kind');
    await handoff.expectChips(['Overdue: True']);
  });

  test('offer only what tells one invoice of the queue from another', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await page.getByRole('button', { exact: true, name: 'Filter' }).click();

    await expect(page.getByRole('option')).toHaveText([
      'Status',
      'Kind',
      'Overdue',
    ]);
  });

  test('say no invoice matches, and clear themselves from the message', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.search('nobody');

    await expect(handoff.empty()).toContainText(
      'No invoice matches these filters',
    );
    // The queue is not empty: the command that takes what waits has no place here.
    await expect(handoff.empty()).not.toContainText(
      'kaiten billing handoff claim',
    );
    await handoff
      .empty()
      .getByRole('button', { name: 'Clear filters' })
      .click();

    await handoff.expectInvoiceIds(WAITING);
    await expect(handoff.searchField()).toHaveValue('');
  });

  test('stay with the part of the queue they were set in', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.search('globex');
    await handoff.expectInvoiceIds(['inv-g1']);

    await handoff.showTab('Acknowledged');

    // Each part of the queue is a list of its own.
    await handoff.expectInvoiceIds(ACKNOWLEDGED);
    await expect(handoff.searchField()).toHaveValue('');
  });

  test('says the waiting tab is the current one when a link spells out what the queue opens on', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto('?status=PENDING');

    await handoff.expectInvoiceIds(WAITING);
    await expect(handoff.tab('Waiting')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(handoff.tab('Acknowledged')).not.toHaveAttribute(
      'aria-current',
    );
  });
});

test.describe('the queue of what was acknowledged', () => {
  test('lists what the accounting system booked, with the number it gave each invoice', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.showTab('Acknowledged');

    await handoff.expectInvoiceIds(ACKNOWLEDGED);
    await expect(handoff.row('inv-d1')).toContainText('ERP-1001');
    await expect(handoff.row('inv-d1')).toContainText(
      'Feb 3, 2026, 9:00 AM (UTC)',
    );
    await expect(handoff.row('inv-d2')).toContainText('ERP-0987');
    // Acknowledged with no number: it is said, not left blank.
    await expect(handoff.row('inv-u1')).toContainText('No reference');
    await expect(handoff.row('inv-d2')).toContainText('3 claims');
  });

  test('is in the URL, so that a link to it survives a reload, and the queue opens on what waits', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    expect(new URL(page.url()).search).toBe('');

    await handoff.showTab('Acknowledged');
    await expect(page).toHaveURL(/\/billing\/handoff\?status=ACKNOWLEDGED$/);
    await page.reload();

    await expect(handoff.tab('Acknowledged')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(handoff.tab('Waiting')).not.toHaveAttribute('aria-current');
    await handoff.expectInvoiceIds(ACKNOWLEDGED);

    await handoff.showTab('Waiting');
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await handoff.expectInvoiceIds(WAITING);
  });

  test('offers no acknowledgement for what was booked already', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto('?status=ACKNOWLEDGED');

    await handoff.expectInvoiceIds(ACKNOWLEDGED);
    await expect(
      page.getByRole('button', { name: 'Acknowledge', exact: true }),
    ).toHaveCount(0);
  });

  test('says nothing was acknowledged yet, with no command to run', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createEmptyInvoicesModel());

    await handoff.goto('?status=ACKNOWLEDGED');

    await expect(handoff.empty()).toContainText('Nothing acknowledged yet');
    await expect(handoff.empty()).not.toContainText(
      'kaiten billing handoff claim',
    );
  });
});

test.describe('acknowledging an invoice by hand', () => {
  test('sends the number the accounting system gave it, with no lease, and moves the invoice to what was acknowledged', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const writes = recordWrites(page, /\/billing\/handoff\/[^/]+\/ack$/);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledge('inv-r1', 'ERP-9');

    await expectToast(page, 'Invoice acknowledged');
    await expect(handoff.dialog()).toHaveCount(0);
    // The body is the number alone: this is not the consumer that claimed it.
    expect(writes).toHaveLength(1);
    expect(writes[0].pathname).toBe('/api/billing/handoff/inv-r1/ack');
    expect(writes[0].body).toEqual({ externalReference: 'ERP-9' });
    // It left the queue of what waits, and is in the other.
    await handoff.expectInvoiceIds(['inv-m1', 'inv-p1', 'inv-g1']);
    await handoff.showTab('Acknowledged');
    // Oldest issue first: the replacement was issued before them all.
    await handoff.expectInvoiceIds(['inv-r1', 'inv-u1', 'inv-d2', 'inv-d1']);
    await expect(handoff.row('inv-r1')).toContainText('ERP-9');
  });

  test('can be confirmed with no number at all', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    const writes = recordWrites(page, /\/billing\/handoff\/[^/]+\/ack$/);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledge('inv-g1');

    await expectToast(page, 'Invoice acknowledged');
    expect(writes[0].body).toEqual({});
  });

  test('says which invoice it is about, and warns when a consumer holds it', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledgeButton('inv-p1').click();

    await expect(handoff.dialog()).toContainText(
      'Initech · Renewal Apr 1, 2026 (UTC) · $27.39',
    );
    await expect(
      handoff.dialog().getByTestId('acknowledge-handoff-leased'),
    ).toContainText('A consumer holds this invoice until');
  });

  test('does not warn about an invoice nobody holds', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledgeButton('inv-m1').click();

    await expect(handoff.dialog()).toBeVisible();
    await expect(
      handoff.dialog().getByTestId('acknowledge-handoff-leased'),
    ).toHaveCount(0);
  });

  test('refuses a number longer than the API takes, before asking it', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const writes = recordWrites(page, /\/billing\/handoff\/[^/]+\/ack$/);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledgeButton('inv-g1').click();
    await handoff.reference().fill('x'.repeat(256));

    await expect(
      handoff.dialog().getByText('The reference is too long'),
    ).toBeVisible();
    await expect(handoff.confirm()).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  test('shows a refusal of the API as it was written, keeps the dialog open and reads the queue again', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const reads = recordWrites(page, /\/api\/billing\/handoff$/, ['GET']);
    const model = createInvoicesModel();
    model.invoices.armProblem('ackHandoff', {
      code: 'AckHandoff.ReferenceMismatch',
      detail: 'the invoice was already acknowledged under another reference',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await handoff.goto();
    const readsBefore = reads.length;
    await handoff.acknowledge('inv-m1', 'ERP-2');

    await expect(
      handoff
        .dialog()
        .getByText(
          'the invoice was already acknowledged under another reference',
        ),
    ).toBeVisible();
    await expect(handoff.dialog()).toBeVisible();
    // The invoice is not what the queue showed: the queue is read again.
    await expect.poll(() => reads.length).toBeGreaterThan(readsBefore);
  });

  test('is cancelled without sending anything', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    const writes = recordWrites(page, /\/billing\/handoff\/[^/]+\/ack$/);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledgeButton('inv-g1').click();
    await handoff
      .dialog()
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();

    await expect(handoff.dialog()).toHaveCount(0);
    expect(writes).toHaveLength(0);
  });

  test('is offered only to a session that may write billing', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();

    await handoff.expectInvoiceIds(WAITING);
    await expect(
      page.getByRole('button', { name: 'Acknowledge', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('columnheader', { name: 'Actions' }),
    ).toHaveCount(0);
  });

  test('is offered to a session that may', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.sales);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();

    await expect(handoff.acknowledgeButton('inv-g1')).toBeVisible();
  });

  test('is seen on the page of the invoice once it was done', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await handoff.goto();
    await handoff.acknowledge('inv-g1', 'ERP-77');
    await expectToast(page, 'Invoice acknowledged');
    await handoff.row('inv-m1').getByRole('link').first().click();
    await invoice.goto('inv-g1');

    await expect(invoice.handoff()).toContainText('Acknowledged');
    await expect(invoice.handoff()).toContainText('ERP-77');
  });
});

test.describe('the queue when the API refuses it', () => {
  test('shows why, with a way to ask again', async ({ page }) => {
    const handoff = new BillingHandoffDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('listHandoff', {
      detail: 'the queue is unavailable',
      errorId: 'trace-queue-1',
      status: 500,
    });
    await installBillingAppMocks(page, model);

    await handoff.gotoRefused();

    await expect(handoff.error()).toContainText('the queue is unavailable');
    await expect(handoff.error()).toContainText('Reference trace-queue-1');
    // The console around it still works.
    await expect(
      page.getByRole('link', { name: 'Invoices', exact: true }),
    ).toBeVisible();

    await handoff.error().getByRole('button', { name: 'Retry' }).click();

    await handoff.expectInvoiceIds(WAITING);
    await expect(handoff.error()).toHaveCount(0);
  });

  test('shows why when a page of the walk is refused, and reads the whole queue again when asked', async ({
    page,
  }) => {
    const handoff = new BillingHandoffDriver(page);
    const model = createLongHandoffQueueModel(230);
    model.invoices.armProblem('listHandoff', {
      after: 1,
      detail: 'the queue is unavailable',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await handoff.gotoRefused();

    // The first page was read and the second was refused: nothing partial is shown.
    await expect(handoff.error()).toContainText('the queue is unavailable');
    await expect(handoff.rows()).toHaveCount(0);

    await handoff.error().getByRole('button', { name: 'Retry' }).click();

    await expect(page.getByText('Showing 1-10 of 230 records')).toBeVisible();
    await expect(handoff.error()).toHaveCount(0);
  });
});
