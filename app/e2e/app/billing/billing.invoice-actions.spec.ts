import { expect, recordWrites, test } from '../_support/app-test';
import { expectToast } from '../_support/assertions/toast';
import {
  InvoiceDetailDriver,
  type InvoiceActionName,
} from '../_support/drivers/invoice-detail.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import {
  createDeletedInstanceModel,
  createInvoicesModel,
} from './billing.scenarios';

// What a person does to one invoice, and what the page does about it. An action
// is offered where the status of the invoice allows it and the scopes of the
// session cover it; each one is audited with a reason or a number, and the page
// shows the invoice as the API answered, never before.

const WRITES =
  /\/api\/invoices\/[^/]+\/(release-hold|recompose|mark-paid|write-off|void)$/;

/** A time at which something was surely done: yesterday, at ten, in the format of the field. */
const yesterdayAt10 = () => {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return `${day.toISOString().slice(0, 10)}T10:00`;
};
const tomorrowAt10 = () => {
  const day = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return `${day.toISOString().slice(0, 10)}T10:00`;
};

test.describe('the actions an invoice offers', () => {
  const cases: Array<[string, string, InvoiceActionName[]]> = [
    ['a held draft', 'inv-h1', ['Release the hold', 'Recompose', 'Void']],
    [
      'an invoice ready to bill',
      'inv-m1',
      ['Mark as paid', 'Write off', 'Void'],
    ],
    ['a paid invoice', 'inv-d1', []],
    ['a written-off invoice', 'inv-u1', []],
    ['a void invoice that was not replaced', 'inv-v2', ['Recompose']],
    ['a void invoice that was replaced', 'inv-v1', []],
  ];

  for (const [name, id, actions] of cases) {
    test(`are ${actions.length === 0 ? 'none' : actions.join(', ')} for ${name}`, async ({
      page,
    }) => {
      const invoice = new InvoiceDetailDriver(page);
      await installBillingAppMocks(page, createInvoicesModel());

      await invoice.goto(id);

      await invoice.expectActions(actions);
    });
  }

  test('leave a replaced void invoice with a link to its replacement and no action', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-v1');

    await invoice.expectActions([]);
    await expect(invoice.replacedBy()).toHaveText('inv-r1');
  });

  test('offer an invoice a payment provider has accepted its own: to read it back or void it, and to retry a failed push', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel({ stripe: true }));

    // Stripe has it: the payment is recorded there, so nothing is marked paid or written off.
    await invoice.goto('inv-s1');
    await invoice.expectActions(['Read from Stripe', 'Void']);

    await invoice.goto('inv-f1');
    await invoice.expectActions(['Retry push', 'Void']);
  });

  test('are shown to a session that may write billing, and to none that may only read it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.reader);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');

    // The invoice is there to read, and nothing to act with.
    await expect(invoice.statusBadge()).toBeVisible();
    await invoice.expectActions([]);
    await expect(page.getByTestId('invoice-actions-menu')).toHaveCount(0);
  });

  test('are all there for a session that signs and settles', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await signInWithScopes(page, SESSION_SCOPES.sales);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');

    await invoice.expectActions(['Mark as paid', 'Write off', 'Void']);
  });
});

test.describe('releasing a hold', () => {
  test('asks for a reason, and sends it as typed once it is one to five hundred characters', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');
    await invoice.action('Release the hold').click();

    await expect(invoice.dialog()).toContainText('Release the hold');
    await expect(invoice.dialog()).toContainText(
      'The invoice is issued with no payment provider and waits in the handoff queue for your ERP.',
    );
    // Nothing is accepted without a reason.
    await expect(invoice.confirm('Release')).toBeDisabled();
    // Five hundred and one characters is one too many.
    await invoice.reason().fill('x'.repeat(501));
    await expect(
      invoice.dialog().getByText('The reason is too long'),
    ).toBeVisible();
    await expect(invoice.confirm('Release')).toBeDisabled();
    await invoice.reason().fill('Accepted after DBA review');
    await expect(invoice.confirm('Release')).toBeEnabled();
    await invoice.confirm('Release').click();

    await expectToast(page, 'Invoice released');
    expect(writes).toHaveLength(1);
    expect(writes[0].pathname).toBe('/api/invoices/inv-h1/release-hold');
    expect(writes[0].body).toEqual({ reason: 'Accepted after DBA review' });
  });

  test('turns the invoice into one ready to bill, which is no longer held', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h1');
    await invoice.action('Release the hold').click();
    await invoice.confirmWithReason('Release', 'Accepted after DBA review');

    await expect(invoice.statusBadge()).toHaveText('Ready to bill');
    await expect(invoice.holdBanner()).toHaveCount(0);
    await expect(invoice.dialog()).toHaveCount(0);
    // It is an invoice like another now, and says who released the hold and why.
    await invoice.expectActions(['Mark as paid', 'Write off', 'Void']);
    await expect(invoice.summary()).toContainText('Hold released');
    await expect(invoice.summary()).toContainText('Accepted after DBA review');
    await expect(invoice.handoff()).toContainText('Waiting for your ERP');
  });

  test('keeps the dialog open with what was typed when the API refuses, and says why', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('releaseHold', {
      code: 'ReleaseInvoiceHold.NotHeld',
      detail: 'this invoice is not held',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-h1');
    await invoice.action('Release the hold').click();
    await invoice.confirmWithReason('Release', 'Accepted after review');

    await expect(
      invoice.dialog().getByText('this invoice is not held'),
    ).toBeVisible();
    await expect(invoice.reason()).toHaveValue('Accepted after review');
    // Nothing was changed.
    await expect(invoice.statusBadge()).toHaveText('Held');
  });
});

test.describe('recomposing an invoice', () => {
  test('composes a held draft again in place, and issues it once its journal is sound', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-h2');
    await invoice.action('Recompose').click();

    await expect(invoice.alertDialog()).toContainText('Recompose the invoice');
    await expect(invoice.alertDialog()).toContainText(
      'The draft is rewritten in place.',
    );
    await invoice
      .alertDialog()
      .getByRole('button', { name: 'Recompose', exact: true })
      .click();

    await expectToast(page, 'Invoice recomposed');
    expect(writes.map((write) => write.pathname)).toEqual([
      '/api/invoices/inv-h2/recompose',
    ]);
    await expect(page).toHaveURL(/\/invoices\/inv-h2$/);
    await expect(invoice.statusBadge()).toHaveText('Ready to bill');
    await expect(invoice.holdBanner()).toHaveCount(0);
  });

  test('gives a void invoice a replacement, and leads to it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-v2');
    await invoice.action('Recompose').click();

    await expect(invoice.alertDialog()).toContainText(
      'Compose a replacement for the boundary this void invoice billed.',
    );
    await invoice
      .alertDialog()
      .getByRole('button', { name: 'Recompose', exact: true })
      .click();

    await expectToast(page, 'Replacement invoice composed');
    await expect(page).toHaveURL(/\/invoices\/inv-v2-replacement-\d+$/);
    await expect(invoice.summary()).toContainText('Replaces');
    await expect(invoice.replaces()).toHaveText('inv-v2');

    // The invoice it replaces points to it, and offers nothing more.
    await invoice.replaces().click();
    await expect(page).toHaveURL(/\/invoices\/inv-v2$/);
    await expect(invoice.summary()).toContainText('Replaced by');
    await invoice.expectActions([]);
  });

  test('opens the replacement a void invoice already has, when the page was stale', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const model = createInvoicesModel();
    model.invoices.armProblem('recompose', {
      code: 'RecomposeInvoice.AlreadyReplaced',
      detail: 'this VOID invoice was already recomposed',
      errors: [
        {
          location: 'replacementInvoiceId',
          message: 'the replacement invoice',
          value: { replacementInvoiceId: 'inv-r1' },
        },
      ],
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-v2');
    await invoice.action('Recompose').click();
    await invoice
      .alertDialog()
      .getByRole('button', { name: 'Recompose', exact: true })
      .click();

    await expect(page).toHaveURL(/\/invoices\/inv-r1$/);
    await expect(invoice.alertDialog()).toHaveCount(0);
  });

  test('offers to void first an invoice that is not a held draft, with one reason for both', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    const model = createInvoicesModel();
    // The page was read while the invoice was held; it no longer is.
    model.invoices.armProblem('recompose', {
      code: 'RecomposeInvoice.InvalidStatus',
      detail: 'only a held DRAFT or a VOID invoice can be recomposed',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-h1');
    await invoice.action('Recompose').click();
    await invoice
      .alertDialog()
      .getByRole('button', { name: 'Recompose', exact: true })
      .click();

    // The refusal is not shown as an error: it leads to the next step.
    await expect(invoice.dialog()).toContainText('Void and recompose');
    await expect(invoice.dialog()).toContainText('One reason covers both.');
    await expect(invoice.confirm('Void and recompose')).toBeDisabled();
    await invoice.reason().fill('Journal replaced after the audit');
    await invoice.confirm('Void and recompose').click();

    await expect(page).toHaveURL(/\/invoices\/inv-h1-replacement-\d+$/);
    expect(writes.map((write) => write.pathname)).toEqual([
      '/api/invoices/inv-h1/recompose',
      '/api/invoices/inv-h1/void',
      '/api/invoices/inv-h1/recompose',
    ]);
    expect(writes[1].body).toEqual({
      reason: 'Journal replaced after the audit',
    });
  });

  test('says the instance was deleted, and offers the recompose disabled from then on', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createDeletedInstanceModel());

    await invoice.goto('inv-gone');
    await invoice.action('Recompose').click();
    await invoice
      .alertDialog()
      .getByRole('button', { name: 'Recompose', exact: true })
      .click();

    await expect(
      invoice
        .alertDialog()
        .getByText(
          "the invoice's instance was deleted: its usage cannot be measured again",
        ),
    ).toBeVisible();
    await invoice.cancel();
    await expect(invoice.alertDialog()).toHaveCount(0);

    await expect(invoice.action('Recompose')).toBeDisabled();
    await invoice.actionReasonTarget('Recompose').hover();
    await expect(
      page.getByRole('tooltip').filter({
        hasText:
          'The instance of this invoice was deleted, so nothing can be recomposed for it.',
      }),
    ).toBeVisible();
  });

  test('is offered disabled for a void invoice whose usage is no longer kept, and says from when it is', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    // Only the last month of usage is kept: the period of this invoice is older.
    await installBillingAppMocks(
      page,
      createInvoicesModel({ retentionMonths: 1 }),
    );

    await invoice.goto('inv-v2');

    await expect(invoice.action('Recompose')).toBeDisabled();
    await invoice.actionReasonTarget('Recompose').hover();
    await expect(
      page
        .getByRole('tooltip')
        .filter({ hasText: 'The usage of this period is no longer kept' }),
    ).toBeVisible();
  });

  test('is offered as it is for a void invoice whose usage is kept', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(
      page,
      createInvoicesModel({ retentionMonths: 600 }),
    );

    await invoice.goto('inv-v2');

    await expect(invoice.action('Recompose')).toBeEnabled();
  });

  test('is offered disabled for a held draft too, whose recompose the API refuses, and leaves it to be released', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(
      page,
      createInvoicesModel({ retentionMonths: 1 }),
    );

    await invoice.goto('inv-h1');

    await expect(invoice.action('Recompose')).toBeDisabled();
    await expect(invoice.action('Release the hold')).toBeEnabled();
  });
});

test.describe('marking an invoice paid', () => {
  test('sends the number the accounting system gave it, the time it was paid and a note, and settles the handoff', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');
    await invoice.action('Mark as paid').click();

    await expect(invoice.dialog()).toContainText(
      'It also acknowledges the invoice in the handoff queue',
    );
    await invoice.dialog().getByLabel('External reference').fill('ERP-1001');
    await invoice
      .dialog()
      .getByLabel(/Paid at/)
      .fill(yesterdayAt10());
    await invoice.dialog().getByLabel('Note').fill('wire transfer');
    await invoice.confirm('Mark as paid').click();

    await expectToast(page, 'Invoice marked as paid');
    expect(writes).toHaveLength(1);
    expect(writes[0].pathname).toBe('/api/invoices/inv-m1/mark-paid');
    // The time was typed in UTC, and is sent as UTC.
    expect(writes[0].body).toEqual({
      externalReference: 'ERP-1001',
      note: 'wire transfer',
      paidAt: `${yesterdayAt10()}:00.000Z`,
    });
    await expect(invoice.statusBadge()).toHaveText('Paid');
    await invoice.expectActions([]);
    await expect(invoice.handoff()).toContainText('Acknowledged');
    await expect(invoice.handoff()).toContainText('ERP-1001');
  });

  test('can be confirmed with nothing filled in: it was paid now', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');
    await invoice.action('Mark as paid').click();
    await invoice.dialog().getByLabel('External reference').waitFor();
    await invoice.confirm('Mark as paid').click();

    await expectToast(page, 'Invoice marked as paid');
    // Only what was filled in is sent: an empty field is not a value.
    expect(writes[0].body).toEqual({});
    await expect(invoice.statusBadge()).toHaveText('Paid');
  });

  test('refuses a payment in the future, and a number longer than the API takes, before asking it', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');
    await invoice.action('Mark as paid').click();

    await invoice
      .dialog()
      .getByLabel(/Paid at/)
      .fill(tomorrowAt10());
    await expect(
      invoice.dialog().getByText('The payment cannot be in the future'),
    ).toBeVisible();
    await expect(invoice.confirm('Mark as paid')).toBeDisabled();

    await invoice
      .dialog()
      .getByLabel(/Paid at/)
      .fill(yesterdayAt10());
    await invoice
      .dialog()
      .getByLabel('External reference')
      .fill('x'.repeat(256));
    await expect(
      invoice.dialog().getByText('The reference is too long'),
    ).toBeVisible();
    await expect(invoice.confirm('Mark as paid')).toBeDisabled();

    await invoice.dialog().getByLabel('External reference').fill('ERP-1001');
    await expect(invoice.confirm('Mark as paid')).toBeEnabled();
    expect(writes).toHaveLength(0);
  });

  test('shows a refusal of the API as it was written, and the invoice is read again', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const reads = recordWrites(page, /\/api\/invoices\/inv-m1$/, ['GET']);
    const model = createInvoicesModel();
    // Someone else paid the invoice between the page reading it and this write.
    model.invoices.armProblem('markPaid', {
      code: 'MarkInvoicePaid.InvalidStatus',
      concurrently: { invoiceId: 'inv-m1', status: 'PAID' },
      detail: 'only a MANUAL invoice can be marked paid; this one is PAID',
      status: 409,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-m1');
    const readsBefore = reads.length;
    await invoice.action('Mark as paid').click();
    await invoice.dialog().getByLabel('External reference').waitFor();
    await invoice.confirm('Mark as paid').click();

    await expect(
      invoice
        .dialog()
        .getByText(
          'only a MANUAL invoice can be marked paid; this one is PAID',
        ),
    ).toBeVisible();
    // A 409 says the invoice is not what the page showed: it is read again, and
    // the page behind the dialog says what it is now, with nothing left to offer.
    await expect.poll(() => reads.length).toBeGreaterThan(readsBefore);
    await expect(invoice.statusBadge()).toHaveText('Paid');
    await invoice.expectActions([]);
    // The reason is still where the person asked, and closes when they say so.
    await expect(invoice.dialog()).toBeVisible();
    await expect(
      invoice
        .dialog()
        .getByText(
          'only a MANUAL invoice can be marked paid; this one is PAID',
        ),
    ).toBeVisible();
    await invoice.cancel();
    await expect(invoice.dialog()).toHaveCount(0);
  });
});

test.describe('writing an invoice off', () => {
  test('asks for a reason, and gives up collecting the invoice', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');
    await invoice.action('Write off').click();

    await expect(invoice.dialog()).toContainText('Write the invoice off');
    await expect(invoice.confirm('Write off')).toBeDisabled();
    await invoice.reason().fill('customer bankrupt');
    await invoice.confirm('Write off').click();

    await expectToast(page, 'Invoice written off');
    expect(writes[0].pathname).toBe('/api/invoices/inv-m1/write-off');
    expect(writes[0].body).toEqual({ reason: 'customer bankrupt' });
    await expect(invoice.statusBadge()).toHaveText('Written off');
    await invoice.expectActions([]);
  });

  test('is not confirmed for a reason of spaces alone', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-m1');
    await invoice.action('Write off').click();
    await invoice.reason().fill('     ');

    await expect(invoice.confirm('Write off')).toBeDisabled();
  });
});

test.describe('voiding an invoice', () => {
  test('frees its boundary, and offers a recompose once it is void', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');
    await invoice.action('Void').click();

    await expect(invoice.dialog()).toContainText('Void the invoice');
    await expect(invoice.dialog()).toContainText(
      'A handoff still pending stays pending',
    );
    await expect(invoice.confirm('Void invoice')).toBeDisabled();
    await invoice.reason().fill('wrong amount');
    await invoice.confirm('Void invoice').click();

    await expectToast(page, 'Invoice voided');
    expect(writes[0].pathname).toBe('/api/invoices/inv-p1/void');
    expect(writes[0].body).toEqual({ reason: 'wrong amount' });
    await expect(invoice.statusBadge()).toHaveText('Void');
    await invoice.expectActions(['Recompose']);
    await expect(invoice.summary()).toContainText('wrong amount');
  });

  test('shows a failure that changed nothing as such, keeps the status, and sends it again when asked', async ({
    page,
  }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    const model = createInvoicesModel();
    model.invoices.armProblem('voidInvoice', {
      code: 'VoidInvoice.ProviderUnavailable',
      detail: 'the payment provider answered 503',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await invoice.goto('inv-p1');
    await invoice.action('Void').click();
    await invoice.confirmWithReason('Void invoice', 'wrong amount');

    await expect(
      invoice.dialog().getByText('the payment provider answered 503'),
    ).toBeVisible();
    await expect(invoice.dialog()).toContainText(
      'The payment provider could not be reached. Nothing was changed.',
    );
    // The page behind did not move: nothing is shown before the API says it.
    await expect(invoice.statusBadge()).toHaveText('Ready to bill');

    await invoice
      .dialog()
      .getByRole('button', { name: 'Retry', exact: true })
      .click();

    await expectToast(page, 'Invoice voided');
    await expect(invoice.statusBadge()).toHaveText('Void');
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual({ reason: 'wrong amount' });
  });

  test('can be given up on: cancelling sends nothing', async ({ page }) => {
    const invoice = new InvoiceDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installBillingAppMocks(page, createInvoicesModel());

    await invoice.goto('inv-p1');
    await invoice.action('Void').click();
    await invoice.reason().fill('wrong amount');
    await invoice.cancel();

    await expect(invoice.dialog()).toHaveCount(0);
    await expect(invoice.statusBadge()).toHaveText('Ready to bill');
    expect(writes).toHaveLength(0);
  });
});
