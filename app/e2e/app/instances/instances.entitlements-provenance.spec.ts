import { expect, test } from '../_support/app-test';
import {
  expectNoAccessibilityViolations,
  settle,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { InstanceEntitlementsDriver } from '../_support/drivers/instance-entitlements.driver';
import { startInLanguage } from '../_support/language';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createProvenanceInstancesModel } from './instances.scenarios';

// The limit of an entitlement is the effective one: the license's grant, as the add-ons the
// instance holds and the vouchers it redeemed change it. Where the API says how, the figure
// says it too, in a popover that a mouse, a keyboard and a finger all open; where only the
// license grants it, the figure is alone. Initech Production's `traces` are ten thousand from
// its license, three add-ons of a thousand each, doubled by a voucher; its requests and its
// SSO are the license's own; its seats come from add-ons alone; its storage is made unlimited
// by an add-on.

const TRACES = '10,000 license + 3 × 1,000 add-on × 2 voucher = 26,000';

test.describe('how the limit of an entitlement is composed', () => {
  test.beforeEach(async ({ page }) => {
    await installInstanceAppMocks(page, createProvenanceInstancesModel());
  });

  test('is said by the popover of the figure, on hover, as the arithmetic of the license, the add-ons and the voucher', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');

    await expect(entitlements.limit('Traces')).toHaveText('26,000');
    await entitlements.limit('Traces').hover();

    await expect(entitlements.explanation()).toHaveText(TRACES);
    await expect(entitlements.popup()).toHaveAccessibleName(
      'How this limit is composed',
    );
    // A voucher is said by what it does, never by a code.
    await expect(entitlements.popup()).not.toContainText(/[A-Z]{4,}-/);
    // The row it is on is not opened by it.
    await expect(page).toHaveURL(/\/entitlements$/);
  });

  test('is opened by a click, which does not open the entitlement either, and closed by Escape', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');

    await entitlements.limit('Traces').click();

    await expect(entitlements.explanation()).toHaveText(TRACES);
    await expect(page).toHaveURL(/\/entitlements$/);
    await page.keyboard.press('Escape');
    await expect(entitlements.popup()).toHaveCount(0);
  });

  test('is reached with Tab and opened with Enter, and the focus stays on the figure when it closes', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');
    await expect(entitlements.limit('Traces')).toBeVisible();

    await entitlements.limit('Traces').focus();
    await expect(entitlements.limit('Traces')).toBeFocused();
    await expect(entitlements.limit('Traces')).toHaveAccessibleName(
      '26,000: how the limit of Traces is composed',
    );
    await page.keyboard.press('Enter');

    await expect(entitlements.explanation()).toHaveText(TRACES);
    await page.keyboard.press('Escape');
    await expect(entitlements.popup()).toHaveCount(0);
    await expect(entitlements.limit('Traces')).toBeFocused();
  });

  test('has none for a limit that only the license grants: the figure is alone', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');

    // The API sends the license's grant with no composition: `number` is null.
    await expect(entitlements.row('Requests')).toContainText('5,000');
    await expect(entitlements.limit('Requests')).toHaveCount(0);
    // Nor has a flag one.
    await expect(entitlements.row('SSO')).toBeVisible();
    await expect(entitlements.limit('SSO')).toHaveCount(0);
    await expect(entitlements.source('Requests')).toHaveCount(0);
  });

  test('says that an entitlement is granted by add-ons alone, and by how many', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');

    await expect(entitlements.source('seats')).toHaveText('from add-ons');
    await entitlements.limit('seats').click();
    await expect(entitlements.explanation()).toHaveText('2 × 5 add-on = 10');
    // The license does not grant the others' source.
    await expect(entitlements.source('Traces')).toHaveCount(0);
  });

  test('says who makes a limit unlimited', async ({ page }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');

    await expect(entitlements.limit('Storage GB')).toHaveText('Unlimited');
    await entitlements.limit('Storage GB').click();

    await expect(entitlements.explanation()).toHaveText(
      'Unlimited, granted by an add-on',
    );
  });

  test('is said under the meter of the counter in the usage card as well', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');

    await expect(entitlements.usageCard()).toContainText('4,200');
    await entitlements.cardLimit('Traces').click();

    await expect(entitlements.explanation()).toHaveText(TRACES);
  });

  test('is said in French with the words of the console', async ({ page }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await startInLanguage(page, 'fr');
    await entitlements.goto('initech-prod');

    await expect(entitlements.source('seats')).toHaveText('via les add-ons');
    await entitlements.limit('Traces').click();

    await expect(entitlements.explanation()).toHaveText(
      /^10\s000 licence \+ 3 × 1\s000 add-on × 2 code promo =\s26\s000$/,
    );
    await expect(entitlements.popup()).toHaveAccessibleName(
      'Comment cette limite est composée',
    );
  });

  test('has no WCAG A/AA violation with the popover open, in either theme', async ({
    page,
  }) => {
    const entitlements = new InstanceEntitlementsDriver(page);
    await entitlements.goto('initech-prod');
    await entitlements.limit('Traces').click();
    await expect(entitlements.explanation()).toHaveText(TRACES);

    await settle(page);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expect(entitlements.explanation()).toBeVisible();
    await settle(page);
    await expectNoAccessibilityViolations(page);
  });
});
