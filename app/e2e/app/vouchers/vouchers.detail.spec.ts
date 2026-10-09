import { expect, expectToast, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from './install-vouchers-world';
import { createVouchersBillingModel } from './vouchers.scenarios';

// The page of one voucher: its code, shown to whoever may read vouchers and never in the
// address, what it does in plain language, what was redeemed of it with the way to revoke each
// redemption, and the actions its state offers. The page is frozen at BILLED_NOW.

const WRITES =
  /\/api\/(vouchers\/[^/]+(\/(publish|archive))?|instances\/[^/]+\/vouchers\/[^/]+\/revoke)$/;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
});

test.describe('a voucher', () => {
  test('is addressed by its id, and gives its code with a button to copy it', async ({
    page,
    context,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await installVouchersWorld(page);

    await detail.goto('voucher-welcome', 'Welcome spring');

    await expect(page).toHaveURL('/vouchers/voucher-welcome');
    expect(page.url()).not.toMatch(/WELCOME-SPRING/i);
    await expect(detail.code()).toHaveValue('WELCOME-SPRING-2027');
    await detail.copyButton().click();
    await expectToast(page, 'Code copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'WELCOME-SPRING-2027',
    );
    await expect(page).toHaveURL('/vouchers/voucher-welcome');
  });

  test('says its state, and what it does in plain language, naming what it counts', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.expectState('Active');
    await expect(detail.summary()).toContainText(
      '20% off the base price, on the next 3 invoices.',
    );
    await expect(detail.summary()).toContainText(
      'It can be redeemed 100 times.',
    );
    await expect(detail.summary()).toContainText(
      'Any customer can redeem it, once per instance.',
    );
    await expect(detail.summary()).toContainText(
      'It can be redeemed until Jun 30, 2027 (UTC).',
    );
  });

  test('names the customer it is reserved for, the versions it is limited to and the conditions it sets', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-annual-only', 'Annual only');
    await expect(detail.summary()).toContainText(
      'Only instances with an annual subscription can redeem it.',
    );

    await detail.goto('voucher-hooli-only', 'Hooli only');
    await expect(detail.summary()).toContainText('It is reserved for Hooli.');

    await detail.goto('voucher-starter-only', 'Starter only');
    await expect(detail.summary()).toContainText(
      'It applies only to instances on Starter',
    );
  });

  test('says a boost in billing periods, and each change by the name of its entitlement', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-tokens-x2', 'Tokens times two');

    await expect(detail.summary()).toContainText(
      'Tokens × 2, for 2 billing periods.',
    );
  });

  test('is read as expired when its window closed, though the API keeps it active', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-lapsed', 'Spring 2026 promotion');

    await detail.expectState('Expired');
  });
});

test.describe('what was redeemed of a voucher', () => {
  test('lists the instances, when each redeemed, the window it applies in, the invoices a discount used and its state', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-welcome', 'Welcome spring');

    await expect(detail.redemptions()).toHaveCount(2);
    await expect(detail.redemption('initech-annual')).toContainText(
      'Mar 1, 2026 (UTC)',
    );
    await expect(detail.redemption('initech-annual')).toContainText(
      '1/3 invoices',
    );
    await expect(detail.redemption('initech-annual')).toContainText('Active');
    await expect(detail.redemption('hooli-starter')).toContainText(
      'Oct 5, 2026 (UTC)',
    );
    await expect(detail.redemption('hooli-starter')).toContainText(
      '0/3 invoices',
    );
  });

  test('says when a boost applies, and reads it as expired once its window has closed', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);
    await detail.goto('voucher-tokens-x2', 'Tokens times two');
    await expect(detail.redemption('initech-prod')).toContainText(
      'Oct 1, 2026',
    );
    await expect(detail.redemption('initech-prod')).toContainText(
      'Dec 1, 2026',
    );
    await expect(detail.redemption('initech-prod')).toContainText('Active');
    // A boost has no invoices to count.
    await expect(detail.redemption('initech-prod')).not.toContainText(
      'invoices',
    );

    await page.clock.setFixedTime(new Date('2026-12-15T12:00:00.000Z'));
    await page.reload();

    await detail.expectLoaded('Tokens times two');
    await expect(detail.redemption('initech-prod')).toContainText('Expired');
  });

  test('says so when nothing was redeemed yet', async ({ page }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-launch-boost', 'Launch boost');

    await expect(detail.noRedemptions()).toContainText(
      'No instance has redeemed this voucher yet.',
    );
  });

  test('leads each redemption to the Billing tab of its instance', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.redemption('initech-annual').getByRole('link').first().click();

    await expect(page).toHaveURL('/customers/instances/initech-annual/billing');
  });
});

test.describe('revoking a redemption', () => {
  test('cannot be confirmed without a reason, sends it for the redemption of the instance, and shows the redemption revoked with the reason', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installVouchersWorld(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.revokeButton('initech-annual').click();
    await expect(detail.confirmRevoke()).toBeDisabled();
    await detail.reasonField().fill('   ');
    await expect(detail.confirmRevoke()).toBeDisabled();
    await detail.reasonField().fill('sales error');
    await expect(detail.confirmRevoke()).toBeEnabled();
    await detail.confirmRevoke().click();

    await expect(detail.dialog()).toHaveCount(0);
    await expect(detail.redemption('initech-annual')).toContainText('Revoked');
    await expect(detail.redemption('initech-annual')).toContainText(
      'Revoked: sales error',
    );
    // What no longer applies cannot be revoked again.
    await expect(detail.revokeButton('initech-annual')).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      body: { reason: 'sales error' },
      method: 'POST',
      pathname:
        '/api/instances/initech-annual/vouchers/redemption-annual-welcome/revoke',
    });
    await expectToast(page, 'Welcome spring revoked');
  });

  test('offers it for what still applies only', async ({ page }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-hooli-agreement', 'Hooli agreement');

    await expect(detail.redemption('hooli-starter')).toContainText('Expired');
    await expect(detail.revokeButton('hooli-starter')).toHaveCount(0);
  });

  test('shows what the API refused, and keeps the dialog open with the reason as typed', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('revokeInstanceVoucher', {
      code: 'RevokeInstanceVoucher.NotActive',
      detail: 'the redemption is not active',
      status: 409,
    });
    await installVouchersWorld(page, model);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.revokeButton('initech-annual').click();
    await detail.reasonField().fill('sales error');
    await detail.confirmRevoke().click();

    await expect(detail.dialog()).toContainText('the redemption is not active');
    await expect(detail.reasonField()).toHaveValue('sales error');
  });
});

test.describe('changing a published voucher', () => {
  test('opens a dialog of the four things the API lets change, starting from what the voucher holds', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.editLink().click();

    await expect(page).toHaveURL('/vouchers/voucher-welcome?mode=configure');
    await expect(detail.nameField()).toHaveValue('Welcome spring');
    await expect(detail.descriptionField()).toHaveValue(
      'Twenty percent off the base price for the first three invoices',
    );
    await expect(detail.maxRedemptionsField()).toHaveValue('100');
    await expect(detail.expiresAtField()).toHaveValue('2027-06-30T23:59');
    await expect(detail.saveButton()).toBeDisabled();
  });

  test('sends the voucher as it is stored with the four members changed, and shows what it says', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installVouchersWorld(page);
    await detail.goto('voucher-welcome', 'Welcome spring');
    await detail.editLink().click();

    await detail.nameField().fill('Welcome spring 2027');
    await detail.maxRedemptionsField().fill('150');
    await detail.saveButton().click();

    await expect(detail.dialog()).toHaveCount(0);
    await detail.expectLoaded('Welcome spring 2027');
    await expect(detail.summary()).toContainText(
      'It can be redeemed 150 times.',
    );
    await expectToast(page, 'Voucher saved');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: 'PUT',
      pathname: '/api/vouchers/voucher-welcome',
    });
    expect(writes[0].body).toMatchObject({
      code: 'WELCOME-SPRING-2027',
      duration: 'REPEATING',
      durationInPeriods: 3,
      maxRedemptions: 150,
      name: 'Welcome spring 2027',
      priceAppliesTo: 'LICENSE_BASE',
      priceDiscountType: 'PERCENTAGE',
      priceDiscountValue: '20',
      voucherType: 'PRICE',
    });
  });

  test('refuses before it is asked a maximum under the redemptions already made', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installVouchersWorld(page);
    await detail.goto('voucher-welcome', 'Welcome spring');
    await detail.editLink().click();

    await detail.maxRedemptionsField().fill('1');

    await expect(
      detail
        .dialog()
        .getByText(
          'The voucher has already been redeemed more times than that',
        ),
    ).toBeVisible();
    await expect(detail.saveButton()).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test('shows what the API refused on the field it is about, and stays open with what was typed', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('updateVoucher', {
      code: 'UpdateVoucher.MaxRedemptionsBelowCount',
      detail: 'maxRedemptions is below the redemptions already made',
      status: 409,
    });
    await installVouchersWorld(page, model);
    await detail.goto('voucher-welcome', 'Welcome spring');
    await detail.editLink().click();

    await detail.maxRedemptionsField().fill('50');
    await detail.saveButton().click();

    await expect(
      detail
        .dialog()
        .getByText('maxRedemptions is below the redemptions already made'),
    ).toBeVisible();
    await expect(detail.maxRedemptionsField()).toHaveValue('50');
  });

  test('is not offered for a voucher that is not published', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await page.goto('/vouchers/voucher-hooli-agreement?mode=configure');
    await detail.expectLoaded('Hooli agreement');

    await expect(detail.dialog()).toHaveCount(0);
    await expect(detail.editLink()).toHaveCount(0);
  });
});

test.describe('publishing and archiving', () => {
  test('publishes a draft after a confirmation, and says it is active', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installVouchersWorld(page);
    await detail.goto('voucher-draft', 'Summer sale');
    await detail.expectState('Draft');

    await detail.publishButton().click();
    await expect(detail.confirmation()).toContainText('Publish Summer sale?');
    expect(writes).toEqual([]);
    await detail.confirm('Publish');

    await detail.expectState('Active');
    await expectToast(page, 'Voucher published');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: 'POST',
      pathname: '/api/vouchers/voucher-draft/publish',
    });
    await expect(detail.publishButton()).toHaveCount(0);
  });

  test('archives a voucher after a confirmation, and leaves nothing to do with it', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const writes = recordWrites(page, WRITES);
    await installVouchersWorld(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.archiveButton().click();
    await expect(detail.confirmation()).toContainText(
      'Archive Welcome spring?',
    );
    await detail.confirm('Archive');

    await detail.expectState('Archived');
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      method: 'POST',
      pathname: '/api/vouchers/voucher-welcome/archive',
    });
    await expect(detail.archiveButton()).toHaveCount(0);
    await expect(detail.editLink()).toHaveCount(0);
  });

  test('says what the API refused, and reads the voucher again', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    const model = createVouchersBillingModel();
    model.vouchers.armProblem('archiveVoucher', {
      code: 'ArchiveVoucher.AlreadyArchived',
      detail: 'the voucher is already archived',
      status: 409,
    });
    await installVouchersWorld(page, model);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.archiveButton().click();
    await detail.confirm('Archive');

    await expect(
      page.locator('[data-sonner-toast][data-type="error"]'),
    ).toContainText('the voucher is already archived');
  });

  test('offers what each state allows: a draft is finished or published, a closed voucher is archived or read, an archived one is read', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-draft', 'Summer sale');
    await expect(detail.editLink()).toHaveAttribute(
      'href',
      '/vouchers/voucher-draft/edit',
    );
    await expect(detail.publishButton()).toBeVisible();
    await expect(detail.archiveButton()).toBeVisible();
    await expect(detail.addBoostLink()).toHaveCount(0);

    await detail.goto('voucher-hooli-agreement', 'Hooli agreement');
    await expect(detail.archiveButton()).toBeVisible();
    await expect(detail.editLink()).toHaveCount(0);
    await expect(detail.publishButton()).toHaveCount(0);

    await detail.goto('voucher-archived', 'Black Friday 2025');
    await expect(detail.archiveButton()).toHaveCount(0);
    await expect(detail.editLink()).toHaveCount(0);
    await expect(detail.publishButton()).toHaveCount(0);
  });

  test('offers a boost for the same offer on a published discount, and none on a boost', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await installVouchersWorld(page);

    await detail.goto('voucher-welcome', 'Welcome spring');
    await expect(detail.addBoostLink()).toHaveAttribute(
      'href',
      '/vouchers/new?boostFor=voucher-welcome',
    );

    await detail.goto('voucher-launch-boost', 'Launch boost');
    await expect(detail.addBoostLink()).toHaveCount(0);
  });
});
