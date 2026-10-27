import { expect, test } from '../_support/app-test';
import {
  expectDialogAccessible,
  expectNoAccessibilityViolations,
  useLightTheme,
} from '../_support/assertions/accessibility';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
  createEmptyCheckoutSessionsBillingModel,
} from '../customers/checkout-sessions.scenarios';

// The checkouts under Customers as a person who cannot use a mouse or a screen meets
// them: no violation on the list, empty or full, in either theme, and the panel of a
// checkout keeping the focus inside while it is open and closing on Escape.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
});

test.describe('accessibility of the checkouts', () => {
  test('the list has no WCAG A/AA violations, in either theme', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto();
    await expect(checkouts.rows()).toHaveCount(6);
    await expectNoAccessibilityViolations(page);

    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the list narrowed to nothing, and the list of an organization with no checkout, have none either', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto();
    await checkouts.search('nobody');
    await expect(checkouts.filteredEmpty()).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await installBillingAppMocks(
      page,
      createEmptyCheckoutSessionsBillingModel(),
    );
    await page.goto('/customers/checkout-sessions?status=open');
    await expectNoAccessibilityViolations(page);
  });

  test('the e-mail of a row is a link the keyboard reaches and opens', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto();
    const link = checkouts.openLink('alice@acme.test');
    // The table may draw its rows again as the list settles, which drops a focus given
    // before it: give it again until it holds, then press on the link it landed on.
    await expect(async () => {
      await link.focus();
      await expect(link).toBeFocused({ timeout: 1_000 });
    }).toPass();
    await link.press('Enter');

    await expect(checkouts.detail()).toBeVisible();
  });

  test('the panel of a checkout is accessible, keeps the focus inside and closes on Escape', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    // An open checkout has no link in it to preload a page of an instance while the focus
    // moves through the panel, which these mocks do not serve.
    await checkouts.goto('?session=cs-open');
    await expect(checkouts.detail()).toBeVisible();

    await expectDialogAccessible(page, checkouts.panel());
    await useLightTheme(page);
    await expectNoAccessibilityViolations(page);
  });

  test('the panel of an expired checkout, with its note, has no violation', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto('?session=cs-expired');
    await expect(
      page.getByTestId('checkout-session-expired-note'),
    ).toBeVisible();

    await expectNoAccessibilityViolations(page);
  });
});
