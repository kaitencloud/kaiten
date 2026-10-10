import { devices, type Locator } from '@playwright/test';
import { expect, test } from '../_support/app-test';
import { settle } from '../_support/assertions/accessibility';
import {
  expectNoHorizontalScroll,
  expectScrollsInside,
} from '../_support/assertions/layout';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceVouchersDriver } from '../_support/drivers/instance-vouchers.driver';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { VoucherListDriver } from '../_support/drivers/voucher-list.driver';
import { VoucherWizardDriver } from '../_support/drivers/voucher-wizard.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from '../vouchers/install-vouchers-world';

// The vouchers on the narrowest phone the billing screens are checked at: the pages keep the
// width of the screen, a table too wide for it scrolls inside its card, the wizard fits it
// with its buttons within reach, and each dialog fits it with the code and the verdict readable.

const WIDTH = 375;

test.use({ ...devices['Pixel 5'], viewport: { height: 812, width: WIDTH } });

/** The element is wholly on the screen: neither of its sides is cut off. */
async function expectWithinScreen(element: Locator) {
  const box = await element.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(WIDTH);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await installVouchersWorld(page);
});

test.describe('the list of vouchers, on the narrowest phone', () => {
  test('keeps the width of the screen, its table scrolling inside its card', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);

    await list.goto();
    await expect(list.rows().first()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectScrollsInside(page.getByRole('table'));
    await expectWithinScreen(list.searchField());
    await expectWithinScreen(list.newVoucher());
  });
});

test.describe('the wizard that makes a voucher, on the narrowest phone', () => {
  test('keeps the width of the screen at each step, its buttons within reach', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);

    await wizard.goto();
    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(wizard.kind('Discount'));
    await expectWithinScreen(wizard.kind('Feature grant'));
    await wizard.nameField().fill('Spring');
    await wizard.next().scrollIntoViewIfNeeded();
    await expectWithinScreen(wizard.next());

    await wizard.next().click();
    await wizard.expectStep('Offer');
    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(wizard.percentageField());
    await wizard.percentageField().fill('20');
    await wizard.next().scrollIntoViewIfNeeded();
    await expectWithinScreen(wizard.next());
    await wizard.next().click();

    await wizard.expectStep('Who and when');
    await expectNoHorizontalScroll(page, WIDTH);
    await wizard.codeField().fill('SPRING2027');
    await expect(wizard.weakCodeWarning()).toBeVisible();
    await expectWithinScreen(wizard.weakCodeWarning());
    await wizard.next().scrollIntoViewIfNeeded();
    await wizard.next().click();

    await wizard.expectStep('Review');
    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(wizard.review());
    await wizard.publishButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(wizard.publishButton());
    await expectWithinScreen(wizard.saveDraftButton());
  });

  test('keeps the width of the screen for the changes of a boost', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);

    await wizard.goto();
    await wizard.startAs('Boost', 'More tokens');
    await wizard.addChange().click();
    await wizard.chooseEntitlement(0, 'Tokens');
    await wizard.chooseModifier(0, 'Multiply by');
    await wizard.valueField(0).fill('2');
    await wizard.addChange().click();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(wizard.change(0));
    await expectWithinScreen(wizard.change(1));
  });

  test('keeps the width of the screen where a voucher was published, its code readable and copiable', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);

    await wizard.goto();
    await wizard.startAs('Discount', 'Spring');
    await wizard.percentageField().fill('20');
    await wizard.next().click();
    await wizard.next().click();
    await wizard.publishButton().scrollIntoViewIfNeeded();
    await wizard.publishButton().click();
    await expect(wizard.published()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(wizard.code());
    await expectWithinScreen(wizard.copyButton());
  });
});

test.describe('the page of a voucher, on the narrowest phone', () => {
  test('keeps the width of the screen, its redemptions scrolling inside their card', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);

    await detail.goto('voucher-welcome', 'Welcome spring');
    await expect(detail.redemption('initech-annual')).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(detail.code());
    await expectWithinScreen(detail.copyButton());
    await expectWithinScreen(detail.offerCard());
    await expectWithinScreen(detail.detailsCard());
    await expectScrollsInside(page.getByRole('table'));
    await expect(detail.revokeButton('initech-annual')).toBeAttached();
  });

  test('has dialogs that fit the screen', async ({ page }) => {
    const detail = new VoucherDetailDriver(page);

    await detail.goto('voucher-welcome', 'Welcome spring');
    await detail.editLink().click();
    await expect(detail.maxRedemptionsField()).toBeVisible();
    await settle(page);
    await expectWithinScreen(detail.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await detail.saveButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(detail.saveButton());
    await page.keyboard.press('Escape');

    await detail.revokeButton('initech-annual').click();
    await expect(detail.reasonField()).toBeVisible();
    await settle(page);
    await expectWithinScreen(detail.dialog());
    await expectNoHorizontalScroll(page, WIDTH);
    await page.keyboard.press('Escape');

    await detail.archiveButton().click();
    await expect(detail.confirmation()).toBeVisible();
    await settle(page);
    await expectWithinScreen(detail.confirmation());
    await expectNoHorizontalScroll(page, WIDTH);
  });
});

test.describe('what an instance redeemed, on the narrowest phone', () => {
  test('the card keeps the width of the screen, its table scrolling inside it', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);

    await billing.goto('initech-prod');
    await expect(vouchers.card()).toBeVisible();
    await settle(page);

    await expectNoHorizontalScroll(page, WIDTH);
    await expectWithinScreen(vouchers.card());
    await expectScrollsInside(vouchers.card().getByRole('table'));
    await expect(vouchers.revokeButton('Tokens times two')).toBeAttached();
  });

  test('the dialog that applies a code fits the screen at each step', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.expectOpen();

    await vouchers.check('HOOLI-ONLY-10');
    await expect(vouchers.invalidVerdict()).toBeVisible();
    await settle(page);
    await expectWithinScreen(vouchers.dialog());
    await expectWithinScreen(vouchers.invalidVerdict());
    await expectNoHorizontalScroll(page, WIDTH);

    await vouchers.check('WELCOME-SPRING-2027');
    await expect(vouchers.validVerdict()).toBeVisible();
    await expectWithinScreen(vouchers.validVerdict());
    await vouchers.redeemButton().scrollIntoViewIfNeeded();
    await expectWithinScreen(vouchers.redeemButton());
    await vouchers.redeemButton().click();

    await expect(vouchers.outcomeInvoice()).toBeVisible();
    await settle(page);
    await expectWithinScreen(vouchers.dialog());
    await expectWithinScreen(vouchers.outcomeInvoice());
    await expectNoHorizontalScroll(page, WIDTH);
  });

  test('the dialog that subscribes has its field for a code within reach', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await billing.goto('initech-fresh');
    await billing.subscribeLink().click();

    const field = billing.dialog().getByLabel(/^Voucher code/);
    await field.scrollIntoViewIfNeeded();
    await settle(page);

    await expectWithinScreen(billing.dialog());
    await expectWithinScreen(field);
    await expectNoHorizontalScroll(page, WIDTH);
  });
});
