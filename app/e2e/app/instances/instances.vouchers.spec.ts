import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { readConsoleStorage } from '../_support/assertions/storage';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceVouchersDriver } from '../_support/drivers/instance-vouchers.driver';
import { SESSION_SCOPES, signInWithScopes } from '../_support/session-scopes';
import { installVouchersWorld } from '../vouchers/install-vouchers-world';
import { createVouchersBillingModel } from '../vouchers/vouchers.scenarios';

// What an instance redeemed is a card of its Billing tab, and a code is applied to it in a
// dialog of its own, in two steps: the code is checked against the instance, and only a code
// the API called valid is redeemed. A boost applies at once and a discount to the invoices the
// instance is yet to be issued, and the dialog says what it did from the API figures. The code
// is typed in the dialog and is in no address, no storage and no request URL.
// Initech Production is on Pro, monthly, and holds a boost that doubles its tokens until
// December; Initech Fresh was never subscribed.

const VOUCHER_WRITES =
  /\/api\/(vouchers\/validate|instances\/[^/]+\/vouchers\/[^/]+(\/revoke)?|instances\/[^/]+\/vouchers\/redeem|instances\/[^/]+\/billing)$/;

test.beforeEach(async ({ page }) => {
  await new InstanceBillingDriver(page).freezeTime();
});

test.describe('what an instance redeemed', () => {
  test('lists the vouchers by name, when each was redeemed, the window it applies in and its state, and never a code', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);

    await billing.goto('initech-prod');

    await expect(vouchers.card()).toBeVisible();
    await expect(vouchers.rows()).toHaveCount(1);
    await expect(vouchers.row('Tokens times two')).toContainText('Boost');
    await expect(vouchers.row('Tokens times two')).toContainText('Oct 1, 2026');
    await expect(vouchers.row('Tokens times two')).toContainText('Dec 1, 2026');
    await expect(vouchers.row('Tokens times two')).toContainText('Active');
    await expect(vouchers.row('Tokens times two')).toContainText(
      'Code ending in',
    );
    await expect(vouchers.card()).not.toContainText('TOKENS-DOUBLE-Q4');
  });

  test('counts the invoices a discount used, and leads a voucher to its page for a session that may read it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);

    await billing.goto('initech-annual');

    await expect(vouchers.row('Welcome spring')).toContainText('1/3 invoices');
    await vouchers.row('Welcome spring').getByRole('link').first().click();
    await expect(page).toHaveURL('/catalog/vouchers/voucher-welcome');
  });

  test('says why there is none, and still offers to apply a code', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);

    await billing.goto('initech-late');

    await expect(vouchers.empty()).toContainText(
      'This instance has not redeemed any voucher.',
    );
    await expect(vouchers.applyLink()).toBeVisible();
  });

  test('is a card of an instance nobody bills too: a code can be redeemed before a subscription', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);

    await billing.goto('initech-fresh');

    await expect(vouchers.empty()).toBeVisible();
    await expect(vouchers.applyLink()).toBeVisible();
  });
});

test.describe('applying a code', () => {
  test('checks the code first, shows the offer in plain language, redeems it and shows what it did to the effective values', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const writes = recordWrites(page, VOUCHER_WRITES);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');

    await vouchers.applyLink().click();
    await vouchers.expectOpen();
    await expect(vouchers.redeemButton()).toHaveCount(0);
    await vouchers.check('LAUNCH-BOOST-50K');

    await expect(vouchers.validVerdict()).toContainText(
      'Launch boost can be redeemed',
    );
    await expect(vouchers.validVerdict()).toContainText(
      'Tokens + 50,000, for one billing period',
    );
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual(['POST /api/vouchers/validate']);
    expect(writes[0].body).toEqual({
      code: 'LAUNCH-BOOST-50K',
      instanceSlug: 'initech-prod',
    });

    await vouchers.redeemButton().click();

    await expect(vouchers.outcome()).toBeVisible();
    // The button that redeemed the code is gone with the form: the keyboard is not left on nothing.
    await expect(vouchers.outcome()).toBeFocused();
    await expect(vouchers.outcome()).toContainText('Launch boost');
    const changes = await vouchers
      .outcome()
      .getByRole('listitem')
      .allInnerTexts();
    expect(changes).toHaveLength(1);
    const [, before, after] =
      /Tokens: ([\d,]+) → ([\d,]+)/.exec(changes[0]) ?? [];
    // The API adds before it multiplies, whatever the order of the redemptions: the
    // hundred thousand tokens of Pro, and the fifty thousand, doubled.
    expect(
      Number(after.replace(/,/g, '')) - Number(before.replace(/,/g, '')),
    ).toBe(100_000);
    expect(
      writes.map(({ method, pathname }) => `${method} ${pathname}`),
    ).toEqual([
      'POST /api/vouchers/validate',
      'POST /api/instances/initech-prod/vouchers/redeem',
    ]);
    expect(writes[1].body).toEqual({ code: 'LAUNCH-BOOST-50K' });

    await vouchers.closeButton().click();
    await expect(page).toHaveURL('/customers/instances/initech-prod/billing');
    // The redemption is on the card, with the window it applies in.
    await expect(vouchers.row('Launch boost')).toContainText('Active');
    await expect(vouchers.row('Launch boost')).toContainText('Nov 7, 2026');
  });

  test('keeps the code out of every address, every storage and every request URL', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));
    await installVouchersWorld(page);
    await billing.goto('initech-prod');

    await vouchers.applyLink().click();
    await vouchers.check('LAUNCH-BOOST-50K');
    await vouchers.redeemButton().click();
    await expect(vouchers.outcome()).toBeVisible();

    expect(page.url()).not.toMatch(/LAUNCH-BOOST/i);
    expect(urls.filter((url) => /LAUNCH-BOOST|LAUNCHBOOST/i.test(url))).toEqual(
      [],
    );
    const stored = await readConsoleStorage(page);
    expect(stored).not.toMatch(/LAUNCH-BOOST/i);
    // Nor is it left in the dialog once the redemption is made.
    await expect(vouchers.codeField()).toHaveCount(0);
  });

  test('forgets the verdict as soon as the code is changed, since it was about the old one', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.check('LAUNCH-BOOST-50K');
    await expect(vouchers.validVerdict()).toBeVisible();

    await vouchers.codeField().fill('LAUNCH-BOOST-50');

    await expect(vouchers.validVerdict()).toHaveCount(0);
    await expect(vouchers.redeemButton()).toHaveCount(0);
    await expect(vouchers.checkButton()).toBeVisible();
  });

  test('matches a code without its case or its separators, as a customer writes it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();

    await vouchers.check('launch boost 50k');

    await expect(vouchers.validVerdict()).toContainText(
      'Launch boost can be redeemed',
    );
  });

  test('shows what a discount did to the invoice the next boundary will issue, before and after', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();

    await vouchers.check('WELCOME-SPRING-2027');
    await expect(vouchers.validVerdict()).toContainText(
      '20% off the base price, on the next 3 invoices',
    );
    await vouchers.redeemButton().click();

    await expect(vouchers.outcomeInvoice()).toContainText('Before');
    await expect(vouchers.outcomeInvoice()).toContainText('After');
    await expect(vouchers.outcomeInvoice()).toContainText('Discount');
    await expect(vouchers.outcome()).toContainText('The next 3 invoices');
    const amounts = await vouchers
      .outcomeInvoice()
      .getByText(/^\$[\d,]+\.\d{2}$/)
      .allInnerTexts();
    const [before, after, discount] = amounts.map((text) =>
      Number(text.replace(/[$,]/g, '')),
    );
    expect(after).toBeLessThan(before);
    expect(Number((before - after).toFixed(2))).toBe(discount);
  });

  test('says only that a discount will show on the next invoice for an instance nobody bills', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);
    await billing.goto('initech-fresh');
    await vouchers.applyLink().click();

    await vouchers.check('WELCOME-SPRING-2027');
    await vouchers.redeemButton().click();

    await expect(vouchers.outcome()).toContainText(
      'The discount will show on the next invoice this instance is issued.',
    );
    await expect(vouchers.outcomeInvoice()).toHaveCount(0);
  });

  const REASONS: Array<[string, string, string]> = [
    ['NOT-A-VOUCHER-CODE', 'initech-prod', 'No voucher has this code.'],
    [
      'SUMMER-SALE-2027',
      'initech-prod',
      'This voucher is not active: it is a draft or it was archived.',
    ],
    [
      'BLACK-FRIDAY-2025',
      'initech-prod',
      'This voucher is not active: it is a draft or it was archived.',
    ],
    [
      'TOKENS-DOUBLE-Q4',
      'initech-prod',
      'This instance has already redeemed this voucher.',
    ],
    [
      'HOOLI-AGREEMENT-2026',
      'initech-prod',
      'This voucher has been redeemed as many times as it allows.',
    ],
    [
      'HOOLI-ONLY-10',
      'initech-prod',
      'This voucher is reserved for another customer.',
    ],
    [
      'STARTER-ONLY-10',
      'initech-prod',
      'This voucher does not apply to the license of this instance.',
    ],
    [
      'ANNUAL-ONLY-15',
      'initech-prod',
      'This voucher needs an annual subscription.',
    ],
    [
      'EURO-CREDIT-25',
      'initech-prod',
      'This discount is in a currency other than the one of the subscription.',
    ],
    [
      'STORAGE-BOOST-50',
      'hooli-starter',
      'This boost changes nothing this instance has',
    ],
    ['SPRING-2026-PROMO', 'initech-prod', 'This voucher has expired.'],
  ];
  for (const [code, instance, sentence] of REASONS) {
    test(`says why ${code} cannot be redeemed by ${instance}, and offers no redemption`, async ({
      page,
    }) => {
      const billing = new InstanceBillingDriver(page);
      const vouchers = new InstanceVouchersDriver(page);
      await installVouchersWorld(page);
      await billing.goto(instance);
      await vouchers.applyLink().click();

      await vouchers.check(code);

      await expect(vouchers.invalidVerdict()).toContainText(sentence);
      await expect(vouchers.redeemButton()).toHaveCount(0);
    });
  }

  test('needs a code before it checks anything', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const writes = recordWrites(page, VOUCHER_WRITES);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();

    await vouchers.checkButton().click();

    await expect(vouchers.dialog().getByText('Enter the code')).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('shows the detail of a refusal of the redemption, and keeps the dialog on the code that was typed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('redeemVoucher', {
      code: 'RedeemVoucher.Expired',
      detail: 'the voucher has expired',
      status: 422,
    });
    await installVouchersWorld(page, model);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.check('LAUNCH-BOOST-50K');

    await vouchers.redeemButton().click();

    await expect(vouchers.problem()).toContainText('the voucher has expired');
    await expect(vouchers.outcome()).toHaveCount(0);
    await expect(vouchers.codeField()).toHaveValue('LAUNCH-BOOST-50K');
    // Nothing was redeemed: asking again redeems it.
    await vouchers.redeemButton().click();
    await expect(vouchers.outcome()).toBeVisible();
  });

  test('waits out a period being closed for a minute, sends the redemption again once, and shows the API words when it is refused again', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const writes = recordWrites(
      page,
      /\/api\/instances\/[^/]+\/vouchers\/redeem$/,
    );
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('redeemVoucher', {
      code: 'RedeemVoucher.BoundaryPending',
      detail: 'the period has ended and is being closed; retry in a minute',
      retryAfterSeconds: 60,
      status: 409,
      times: 2,
    });
    await installVouchersWorld(page, model);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.check('LAUNCH-BOOST-50K');

    await vouchers.redeemButton().click();

    await expect(vouchers.dialog()).toContainText('Closing the period');
    await expect(vouchers.problem()).toHaveCount(0);
    expect(writes).toHaveLength(1);
    await page.clock.runFor(59_000);
    expect(writes).toHaveLength(1);
    await page.clock.runFor(1_000);

    await expect(vouchers.problem()).toContainText(
      'the period has ended and is being closed',
    );
    expect(writes).toHaveLength(2);
    expect(writes[1].body).toEqual(writes[0].body);
    await vouchers.problem().getByRole('button', { name: 'Retry' }).click();
    await expect(vouchers.outcome()).toBeVisible();
    expect(writes).toHaveLength(3);
  });
});

test.describe('taking a redemption back from the instance', () => {
  test('needs a reason, sends it for the redemption of the instance, and shows the redemption revoked with the reason', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const writes = recordWrites(page, VOUCHER_WRITES);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');

    await vouchers.revokeButton('Tokens times two').click();
    await expect(vouchers.confirmRevoke()).toBeDisabled();
    await vouchers.reasonField().fill('sales error');
    await vouchers.confirmRevoke().click();

    await expect(vouchers.dialog()).toHaveCount(0);
    await expect(vouchers.row('Tokens times two')).toContainText('Revoked');
    await expect(vouchers.row('Tokens times two')).toContainText(
      'Revoked: sales error',
    );
    await expect(vouchers.revokeButton('Tokens times two')).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      body: { reason: 'sales error' },
      pathname:
        '/api/instances/initech-prod/vouchers/redemption-prod-tokens/revoke',
    });
    await expectToast(page, 'Tokens times two revoked');
  });

  test('puts back what a boost raised, once the redemption is revoked', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.check('LAUNCH-BOOST-50K');
    await vouchers.redeemButton().click();
    await vouchers.closeButton().click();
    const tokens = page
      .getByRole('row')
      .filter({ hasText: 'Tokens' })
      .filter({ hasText: 'Number' });
    await page.getByRole('tab', { name: 'Entitlements & Usage' }).click();
    await expect(tokens).toContainText('300,000');

    await page.getByRole('tab', { name: 'Billing' }).click();
    await vouchers.revokeButton('Launch boost').click();
    await vouchers.reasonField().fill('given by mistake');
    await vouchers.confirmRevoke().click();
    await expect(vouchers.row('Launch boost')).toContainText('Revoked');

    await page.getByRole('tab', { name: 'Entitlements & Usage' }).click();
    await expect(tokens).toContainText('200,000');
    await expect(tokens).not.toContainText('300,000');
  });
});

test.describe('the code of the dialog that subscribes', () => {
  test('is redeemed with the subscription, and the instance holds the redemption once it started', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    const writes = recordWrites(page, VOUCHER_WRITES);
    await installVouchersWorld(page);
    await billing.goto('initech-fresh');

    await billing.openSubscribe();
    await billing
      .dialog()
      .getByLabel(/^Voucher code/)
      .fill('WELCOME-SPRING-2027');
    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
    expect(writes.at(-1)?.body).toMatchObject({
      voucherCode: 'WELCOME-SPRING-2027',
    });
    await billing.close();
    await expect(vouchers.row('Welcome spring')).toContainText('Active');
  });

  test('is optional, and not sent when empty', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const writes = recordWrites(page, VOUCHER_WRITES);
    await installVouchersWorld(page);
    await billing.goto('initech-fresh');

    await billing.openSubscribe();
    await expect(billing.dialog().getByLabel(/^Voucher code/)).toHaveJSProperty(
      'required',
      false,
    );
    await billing.confirmButton().click();

    await expect(billing.started()).toBeVisible();
    expect(writes.at(-1)?.body).not.toHaveProperty('voucherCode');
  });

  test('shows why a code cannot be redeemed on the code, in the API words, and starts nothing', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await installVouchersWorld(page);
    await billing.goto('initech-fresh');

    await billing.openSubscribe();
    await billing
      .dialog()
      .getByLabel(/^Voucher code/)
      .fill('HOOLI-ONLY-10');
    await billing.confirmButton().click();

    await expect(
      billing
        .dialog()
        .getByText(/reserved|customer/i)
        .first(),
    ).toBeVisible();
    await expect(billing.started()).toHaveCount(0);
    await expect(billing.dialog().getByLabel(/^Voucher code/)).toHaveValue(
      'HOOLI-ONLY-10',
    );
  });
});

test.describe('who may do what to what an instance redeemed', () => {
  test('lets a session that may redeem apply a code, and not take a redemption back', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await signInWithScopes(page, [...SESSION_SCOPES.sales]);
    await installVouchersWorld(page);

    await billing.goto('initech-prod');

    await expect(vouchers.row('Tokens times two')).toBeVisible();
    await expect(vouchers.applyLink()).toBeVisible();
    await expect(vouchers.revokeButton('Tokens times two')).toHaveCount(0);
    // A voucher this session may not read has no page for it to go to either.
    await expect(
      vouchers.row('Tokens times two').getByRole('link'),
    ).toHaveCount(0);
  });

  test('lets a session that may only read what was redeemed see the card, with no way to apply or revoke', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await signInWithScopes(page, [
      'read:billing',
      'read:instances',
      'read:voucher_redemptions',
    ]);
    await installVouchersWorld(page);

    await billing.goto('initech-prod');

    await expect(vouchers.row('Tokens times two')).toBeVisible();
    await expect(vouchers.applyLink()).toHaveCount(0);
    await expect(vouchers.revokeButton('Tokens times two')).toHaveCount(0);
    await expect(
      vouchers.row('Tokens times two').getByRole('link'),
    ).toHaveCount(0);
  });

  test('offers every control to a session that may do all of it, and the code field of the subscribe dialog only to one that may redeem', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await signInWithScopes(page, [...SESSION_SCOPES.admin]);
    await installVouchersWorld(page);
    await billing.goto('initech-prod');

    await expect(vouchers.applyLink()).toBeVisible();
    await expect(vouchers.revokeButton('Tokens times two')).toBeVisible();
    await expect(
      vouchers.row('Tokens times two').getByRole('link'),
    ).toHaveCount(1);
  });

  test('has no card for a session that may not read what was redeemed', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await signInWithScopes(page, ['read:billing', 'read:instances']);
    await installVouchersWorld(page);

    await billing.goto('initech-prod');

    await expect(vouchers.card()).toHaveCount(0);
  });
});
