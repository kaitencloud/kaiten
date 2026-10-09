import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { AddonCompatibilityDriver } from '../_support/drivers/addon-compatibility.driver';
import { AddonDetailDriver } from '../_support/drivers/addon-detail.driver';
import { AddonFormDriver } from '../_support/drivers/addon-form.driver';
import { AddonFreezeDriver } from '../_support/drivers/addon-freeze.driver';
import { AddonGrantsDriver } from '../_support/drivers/addon-grants.driver';
import { AddonPricesDriver } from '../_support/drivers/addon-prices.driver';
import { AddonsListDriver } from '../_support/drivers/addons-list.driver';
import { InstanceAddonsDriver } from '../_support/drivers/instance-addons.driver';
import { InstanceBillingDriver } from '../_support/drivers/instance-billing.driver';
import { installAddonsWorld } from '../addons/install-addons-world';

// The add-ons as a person who cannot use a mouse or a screen meets them: no violation on the
// catalogue, on a version and on each of its tabs, in either theme; each dialog and drawer
// keeping the focus inside while it is open and closing on Escape; what is greyed out kept
// in the tab order with the reason said to whoever reaches it; the card of an instance.

test.describe('accessibility of the catalogue of add-ons', () => {
  test.beforeEach(async ({ page }) => {
    await installAddonsWorld(page);
  });

  test('the list, with its families closed and one open, has no WCAG A/AA violations in either theme', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);

    await list.goto();
    await list.expandFamily('Priority support');
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the confirmation to publish is accessible, with the focus held and Escape to leave', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);
    const detail = new AddonDetailDriver(page);

    await list.goto();
    await list.expandFamily('Extra seats');
    await list.action('Extra seats', '2027', 'Publish').click();
    await expect(detail.confirmation()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, detail.confirmation());
  });

  test('the dialog that makes an add-on is accessible', async ({ page }) => {
    const form = new AddonFormDriver(page);

    await page.goto('/addons/new');
    await form.expectOpen('New add-on');
    // The error shows on the field once it was typed in and emptied, and the focus stays inside.
    await form.nameField().fill('x');
    await form.nameField().fill('');
    await page.keyboard.press('Tab');
    await expect(form.dialog().getByText('Name is required')).toBeVisible();

    await expectDialogAccessible(page, form.dialog());
  });

  test('the family switch is a named switch the keyboard reaches', async ({
    page,
  }) => {
    const list = new AddonsListDriver(page);

    await list.goto();
    const toggle = list.publicSwitch('Extra tokens');
    await toggle.focus();
    await page.keyboard.press('Space');

    await expect(toggle).toBeChecked();
  });
});

test.describe('accessibility of a version of an add-on', () => {
  test.beforeEach(async ({ page }) => {
    await installAddonsWorld(page);
  });

  test('the overview has no violations in either theme', async ({ page }) => {
    const detail = new AddonDetailDriver(page);

    await detail.goto('extra-seats-v1', 'Extra seats');
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the tabs are a tab list the arrow keys walk', async ({ page }) => {
    const detail = new AddonDetailDriver(page);

    await detail.goto('extra-seats-v1', 'Extra seats');
    await detail.tab('Overview').focus();
    await page.keyboard.press('ArrowRight');

    await expect(detail.tab('Entitlements')).toBeFocused();
  });

  test('the entitlements tab has no violations in either theme', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);

    await grants.goto('extra-tokens-v1', 'Extra tokens');
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the dialog that gives an entitlement is accessible, with the warning of a lower overage', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);

    await grants.goto('extra-seats-v2', 'Extra seats');
    await grants.addLink().click();
    await grants.chooseEntitlement('Tokens');
    await grants.valueField().fill('10000');
    await grants.overageField().fill('10');
    await expect(grants.overageWarning()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, grants.dialog());
  });

  test('the confirmation to remove an entitlement is accessible', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);

    await grants.goto('priority-support-v2', 'Priority support');
    await grants.removeButton('Advanced Analytics').click();
    await expect(grants.confirmation()).toBeVisible();

    await expectDialogAccessible(page, grants.confirmation());
  });

  test('the prices tab has no violations in either theme, with its slots and its footnote', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);

    await prices.goto('extra-tokens-v1', 'Extra tokens');
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the drawer of a new price is accessible', async ({ page }) => {
    const prices = new AddonPricesDriver(page);

    await prices.goto('extra-seats-v2', 'Extra seats');
    await prices.addPrice().click();
    await prices.amountField().fill('15.00');
    await expect(prices.livePreview()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, prices.drawer());
  });

  test('the question before a default is replaced is accessible', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);

    await prices.goto('extra-seats-v2', 'Extra seats');
    await prices.addPrice().click();
    await prices.amountField().fill('15.00');
    await prices.defaultCheckbox().check();
    await prices.createButton().click();
    await expect(prices.confirmation()).toBeVisible();

    await expectDialogAccessible(page, prices.confirmation());
  });

  test('the price that cannot be deprecated stays in the tab order, and says why to whoever reaches it', async ({
    page,
  }) => {
    const prices = new AddonPricesDriver(page);

    await prices.goto('extra-seats-v2', 'Extra seats');
    const deprecate = prices.deprecateButton('Extra seat, monthly');
    await deprecate.focus();

    await expect(deprecate).toBeFocused();
    await expect(deprecate).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('tooltip')).toContainText(
      'The default price of a period bills every instance that holds this version.',
    );
  });

  test('the action that is greyed out stays in the tab order, and says why', async ({
    page,
  }) => {
    const detail = new AddonDetailDriver(page);

    await detail.goto('extra-tokens-v1', 'Extra tokens');
    const wrapper = detail.action('Archive').locator('xpath=..');

    await expect(wrapper).toHaveAttribute('tabindex', '0');
    await wrapper.focus();
    await expect(page.getByRole('tooltip')).toContainText(
      'The default version cannot be archived',
    );
  });

  test('the compatibility tab has no violations in either theme, with the warning of a version that fits nothing', async ({
    page,
  }) => {
    const compatibility = new AddonCompatibilityDriver(page);

    await compatibility.goto('extra-seats-v2', 'Extra seats');
    await compatibility.box(/^Pro/).click();
    await expect(compatibility.emptyWarning()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the dialog of a version a billed instance holds is accessible', async ({
    page,
  }) => {
    const grants = new AddonGrantsDriver(page);
    const freeze = new AddonFreezeDriver(page);

    await grants.goto('extra-seats-v1', 'Extra seats');
    await grants.removeButton('Seats').click();
    await grants.confirmRemoval();
    await freeze.expectTitle('This version is held by a billed instance');

    await expectDialogAccessible(page, freeze.dialog());
  });
});

test.describe('accessibility of the add-ons of an instance', () => {
  test.beforeEach(async ({ page }) => {
    await new InstanceBillingDriver(page).freezeTime();
    await installAddonsWorld(page);
  });

  test('the card, with its steppers, has no violations in either theme', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await expect(addons.card()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the stepper is a named group of buttons the keyboard operates', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await addons.more('Extra seats · 2026').focus();
    await page.keyboard.press('Enter');

    await expect(addons.quantity('Extra seats · 2026')).toHaveText('3');
  });

  test('the dialog that adds an add-on is accessible, with its price', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await addons.openAttach();
    await addons.chooseAddon('Extra tokens · 2026');
    await expect(addons.attachDetails()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, addons.dialog());
  });

  test('the confirmation to take one off is accessible', async ({ page }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-prod');
    await addons.removeButton('Extra seats · 2026').click();
    await expect(addons.confirmation()).toBeVisible();

    await expectDialogAccessible(page, addons.confirmation());
  });

  test('the dialog that subscribes an instance with add-ons is accessible', async ({
    page,
  }) => {
    const billing = new InstanceBillingDriver(page);
    const addons = new InstanceAddonsDriver(page);

    await billing.goto('initech-fresh');
    await billing.subscribeLink().click();
    await expect(addons.subscribeAddons()).toBeVisible();

    await useLightTheme(page);
    await expectDialogAccessible(page, billing.dialog());
  });
});
