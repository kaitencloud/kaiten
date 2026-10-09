import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { InstanceVouchersDriver } from '../_support/drivers/instance-vouchers.driver';
import { VoucherDetailDriver } from '../_support/drivers/voucher-detail.driver';
import { VoucherListDriver } from '../_support/drivers/voucher-list.driver';
import { VoucherWizardDriver } from '../_support/drivers/voucher-wizard.driver';
import { BILLED_NOW } from '../billing/billed-instances';
import { installVouchersWorld } from '../vouchers/install-vouchers-world';

// The vouchers as a person who cannot use a mouse or a screen meets them: no violation on the
// list, on each step of the wizard, on the page of a voucher and on the card of an instance, in
// either theme; each dialog keeping the focus inside while it is open and closing on Escape;
// what cannot be chosen yet kept in the tab order with the reason said to whoever reaches it.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(BILLED_NOW));
  await installVouchersWorld(page);
});

async function expectAccessibleInBothThemes(
  page: import('@playwright/test').Page,
) {
  await settle(page);
  await expectNoAccessibilityViolations(page);

  await useLightTheme(page);
  await expectNoAccessibilityViolations(page);
}

test.describe('accessibility of the list of vouchers', () => {
  test('has no WCAG A/AA violations in either theme', async ({ page }) => {
    const list = new VoucherListDriver(page);

    await list.goto();
    await expect(list.rows().first()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('has none either where a search keeps no row', async ({ page }) => {
    const list = new VoucherListDriver(page);
    await list.goto();

    await list.searchField().fill('introuvable');
    await expect(list.filteredEmpty()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('names the search and the opening by code, and a code that matches nothing is said to whoever reads the page', async ({
    page,
  }) => {
    const list = new VoucherListDriver(page);
    await list.goto();

    await expect(list.searchField()).toHaveAccessibleName(/./);
    await expect(list.lookupField()).toBeVisible();
    await list.lookup('NOPE-NOPE-NOPE');

    // Said in a live region, and kept with the field for whoever comes back to it.
    await expect(list.lookupNotFound()).toBeVisible();
    await expect(list.lookupNotFound()).toHaveAttribute('role', 'status');
    await expect(list.lookupField()).toHaveAccessibleDescription(
      /No voucher has this code\./,
    );
  });
});

test.describe('accessibility of the wizard that makes a voucher', () => {
  test('the first step has no violations in either theme, with the two kinds that come later greyed out', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);

    await wizard.goto();

    await expectAccessibleInBothThemes(page);
  });

  test('the kinds that come later stay in the tab order and say why to whoever reaches them', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();

    await wizard.kind('Feature grant').focus();

    await expect(wizard.kind('Feature grant')).toBeFocused();
    await expect(wizard.kind('Feature grant')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(wizard.kind('Feature grant')).toContainText(
      'Available in a later version',
    );
  });

  test('the step that is not valid says what is wrong on the fields, in a form that has no violation', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();

    await wizard.next().click();
    await expect(wizard.error('Enter a name')).toBeVisible();
    await expect(wizard.nameField()).toHaveAttribute('aria-invalid', 'true');

    await expectAccessibleInBothThemes(page);
  });

  test('the offer of a discount has no violations in either theme, with the prices to choose from', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Some prices');
    await wizard.percentageField().fill('15');
    await wizard.appliesTo('Chosen prices').click();
    await expect(wizard.priceList()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the offer of a boost has no violations in either theme, with its changes', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Boost', 'More tokens');
    await wizard.addChange().click();
    await wizard.chooseEntitlement(0, 'Tokens');
    await wizard.chooseModifier(0, 'Add');
    await wizard.valueField(0).fill('50000');
    await wizard.addChange().click();

    await expectAccessibleInBothThemes(page);
  });

  test('the step of who and when has no violations in either theme, with the warning of a short code', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Spring');
    await wizard.percentageField().fill('20');
    await wizard.next().click();
    await wizard.expectStep('Who and when');
    await wizard.codeField().fill('SPRING2027');
    await expect(wizard.weakCodeWarning()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the review has no violations in either theme', async ({ page }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Spring');
    await wizard.percentageField().fill('20');
    await wizard.next().click();
    await wizard.next().click();
    await wizard.expectStep('Review');
    await expect(wizard.review()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the page that follows a publication has no violations in either theme, and its copy button is reached by the keyboard', async ({
    page,
  }) => {
    const wizard = new VoucherWizardDriver(page);
    await wizard.goto();
    await wizard.startAs('Discount', 'Spring');
    await wizard.percentageField().fill('20');
    await wizard.next().click();
    await wizard.next().click();
    await wizard.publishButton().click();
    await expect(wizard.published()).toBeVisible();

    // The focus is on the page that replaced the wizard, and a key away from its code.
    await expect(wizard.published()).toBeFocused();
    await expect(wizard.published()).toHaveAccessibleName('Voucher published');
    await wizard.copyButton().focus();
    await expect(wizard.copyButton()).toBeFocused();
    await expectAccessibleInBothThemes(page);
  });
});

test.describe('accessibility of the page of a voucher', () => {
  test('a discount, with its redemptions, has no violations in either theme', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);

    await detail.goto('voucher-welcome', 'Welcome spring');
    await expect(detail.redemption('initech-annual')).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('a boost has no violations in either theme', async ({ page }) => {
    const detail = new VoucherDetailDriver(page);

    await detail.goto('voucher-launch-boost', 'Launch boost');

    await expectAccessibleInBothThemes(page);
  });

  test('a draft and an archived voucher have none either', async ({ page }) => {
    const detail = new VoucherDetailDriver(page);

    await detail.goto('voucher-draft', 'Summer sale');
    await expectAccessibleInBothThemes(page);

    await detail.goto('voucher-archived', 'Black Friday 2025');
    await expectAccessibleInBothThemes(page);
  });

  test('the dialog that changes a published voucher is accessible, with the error of a maximum below its count', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.editLink().click();
    await expect(detail.maxRedemptionsField()).toBeVisible();
    await detail.maxRedemptionsField().fill('1');
    // Tab leaves the field, so that it says what is wrong, and keeps the focus in the dialog.
    await page.keyboard.press('Tab');
    await expect(
      detail
        .dialog()
        .getByText(
          'The voucher has already been redeemed more times than that',
        ),
    ).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, detail.dialog());
  });

  test('the dialog that revokes a redemption is accessible', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.revokeButton('initech-annual').click();
    await expect(detail.reasonField()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, detail.dialog());
  });

  test('the confirmation to archive is accessible', async ({ page }) => {
    const detail = new VoucherDetailDriver(page);
    await detail.goto('voucher-welcome', 'Welcome spring');

    await detail.archiveButton().click();
    await expect(detail.confirmation()).toBeVisible();

    await expectDialogAccessible(page, detail.confirmation());
  });

  test('the confirmation to publish a draft is accessible', async ({
    page,
  }) => {
    const detail = new VoucherDetailDriver(page);
    await detail.goto('voucher-draft', 'Summer sale');

    await detail.publishButton().click();
    await expect(detail.confirmation()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, detail.confirmation());
  });
});

test.describe('accessibility of what an instance redeemed', () => {
  test('the card has no violations in either theme', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);

    await billing.goto('initech-prod');
    await expect(vouchers.card()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the empty card has none either', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);

    await billing.goto('initech-fresh');
    await expect(vouchers.empty()).toBeVisible();

    await expectAccessibleInBothThemes(page);
  });

  test('the dialog that applies a code is accessible at each of its steps', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.expectOpen();

    // A code that cannot be redeemed: the verdict is an alert the screen reader reads.
    await vouchers.check('HOOLI-ONLY-10');
    await expect(vouchers.invalidVerdict()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    // A code that can, and then what it did.
    await vouchers.check('LAUNCH-BOOST-50K');
    await expect(vouchers.validVerdict()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
    await vouchers.redeemButton().click();
    await expect(vouchers.outcome()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, vouchers.dialog());
  });

  test('the outcome of a discount, with the invoice before and after, has no violation', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await billing.goto('initech-prod');
    await vouchers.applyLink().click();
    await vouchers.check('WELCOME-SPRING-2027');
    await vouchers.redeemButton().click();
    await expect(vouchers.outcomeInvoice()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, vouchers.dialog());
  });

  test('the dialog that revokes a redemption is accessible', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const vouchers = new InstanceVouchersDriver(page);
    await billing.goto('initech-prod');

    await vouchers.revokeButton('Tokens times two').click();
    await expect(vouchers.reasonField()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, vouchers.dialog());
  });

  test('the dialog that subscribes an instance has a field for a code the keyboard reaches', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    await billing.goto('initech-fresh');
    await billing.subscribeLink().click();

    const field = billing.dialog().getByLabel(/^Voucher code/);
    await expect(field).toBeVisible();
    await field.focus();
    await expect(field).toBeFocused();
    await expect(field).toHaveAccessibleDescription(/Optional/);

    await useLightTheme(page);
    await expectDialogAccessible(page, billing.dialog());
  });
});
