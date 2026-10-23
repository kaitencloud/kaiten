import { expect, test } from '../_support/app-test';
import { recordWrites } from '../_support/assertions/requests';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
} from './checkout-sessions.scenarios';

// The panel of one checkout, which `?session=<id>` opens over the list: every member the
// contract returns of it, read from the API apart from the list. The page is frozen at
// CHECKOUT_NOW, as the list is.

const ONE_CHECKOUT = /^\/api\/checkout-sessions\/[^/]+$/;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
});

test.describe('the panel of a checkout', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());
  });

  test('opens from a row, over the list, and its address says which checkout', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    const reads = recordWrites(page, ONE_CHECKOUT, ['GET']);

    await checkouts.goto();
    await checkouts.row('alice@acme.test').getByRole('cell').first().click();

    await expect(page).toHaveURL(/\?session=cs-completed$/);
    await expect(checkouts.panel()).toBeVisible();
    await expect(checkouts.detail()).toBeVisible();
    expect(reads.map((read) => read.pathname)).toEqual([
      '/api/checkout-sessions/cs-completed',
    ]);
    await expect(checkouts.rows()).toHaveCount(6);
  });

  test('shows every member the API returns of the checkout', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-annual');

    await expect(checkouts.detail()).toBeVisible();
    await expect(checkouts.detailRow('Email')).toContainText(
      'carol@globex.test',
    );
    await expect(checkouts.detailRow('License')).toContainText('pro-v2');
    await expect(checkouts.detailRow('Period')).toContainText('Annual');
    await expect(checkouts.detailRow('Price')).toContainText(
      'price-pro-annual',
    );
    await expect(checkouts.detailRow('Add-ons')).toContainText(
      'extra-seats × 3',
    );
    await expect(checkouts.detailRow('Publishable key')).toContainText(
      'Legacy checkout',
    );
    await expect(checkouts.detailRow('Publishable key')).toContainText(
      'pk-old',
    );
    await expect(checkouts.detailRow('Trial')).toContainText('Ends');
    await expect(checkouts.detailRow('Customer created')).toContainText(
      'Annual Buyer',
    );
    await expect(checkouts.detailRow('Instance created')).toContainText(
      'annual-buyer-prod',
    );
    await expect(checkouts.detailRow('Completed')).not.toContainText('—');
    await expect(checkouts.detailRow('Closed')).not.toContainText('—');
    await expect(checkouts.detailRow('Expires')).not.toContainText('—');
    await expect(checkouts.detailRow('Created')).toContainText('2026');
  });

  test('shows what is due today, line by line, with the totals of the API', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-annual');

    const dueToday = page.getByTestId('checkout-session-due-today');
    await expect(dueToday).toContainText('Welcome discount');
    await expect(dueToday).toContainText('€588.00');
    await expect(dueToday).toContainText('€58.80');
    await expect(dueToday).toContainText('Subtotal');
    await expect(dueToday).toContainText('Total');
    await expect(dueToday).toContainText('€529.20');
  });

  test('says the checkout is open, and that no customer exists yet', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-open');

    await expect(checkouts.detailRow('Customer created')).toContainText('—');
    await expect(checkouts.detailRow('Instance created')).toContainText('—');
    await expect(checkouts.detailRow('Completed')).toContainText('—');
    await expect(checkouts.detailRow('Closed')).toContainText('—');
    await expect(checkouts.detailRow('Add-ons')).toContainText('—');
    await expect(checkouts.detailRow('Trial')).toContainText('No trial');
  });

  test('says when the trial was refused because the e-mail already had it', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-completed');

    await expect(checkouts.detailRow('Trial')).toContainText(
      'This email already had the trial of this plan',
    );
    await expect(checkouts.detailRow('Client reference')).toContainText(
      'cmp-17',
    );
  });

  test('says on an expired checkout that its customer and instance remain', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-expired');

    await expect(
      page.getByTestId('checkout-session-expired-note'),
    ).toContainText(
      'fallback version of the license, with a canceled subscription, for you to delete',
    );
    await checkouts.close();
    await checkouts.goto('?session=cs-completed');
    await expect(page.getByTestId('checkout-session-expired-note')).toHaveCount(
      0,
    );
  });

  test('links the customer to its page and the instance to its Billing tab', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-completed');

    const panel = checkouts.panel();
    await expect(
      panel.getByRole('link', { name: 'Bought Online', exact: true }),
    ).toHaveAttribute('href', '/customers/bought-online');
    await expect(
      panel.getByRole('link', { name: 'bought-online-prod' }),
    ).toHaveAttribute(
      'href',
      '/customers/instances/bought-online-prod/billing',
    );
  });

  test('closes with Escape and leaves the list, and its filters, as they were', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await checkouts.search('globex');
    await expect(checkouts.rows()).toHaveCount(2);
    await checkouts.row('carol@globex.test').getByRole('cell').first().click();
    await expect(checkouts.detail()).toBeVisible();

    await checkouts.close();

    await expect(page).not.toHaveURL(/session=/);
    await expect(checkouts.rows()).toHaveCount(2);
    await expect(checkouts.searchField()).toHaveValue('globex');
  });

  test('opens from the keyboard, on the e-mail of a row', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await checkouts.openLink('dana@hooli.test').focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\?session=cs-open$/);
    await expect(checkouts.detail()).toBeVisible();
  });

  test('takes the focus itself when it opens, and gives it back to the e-mail it was opened from', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();
    await checkouts.openLink('alice@acme.test').focus();
    await page.keyboard.press('Enter');

    // Not the scrolling body of the panel, which would be framed by a ring: the panel,
    // named by its title.
    await expect(checkouts.panel()).toBeFocused();
    await expect(
      checkouts.panel().getByRole('heading', { name: 'alice@acme.test' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(checkouts.panel()).toHaveCount(0);
    await expect(checkouts.openLink('alice@acme.test')).toBeFocused();
  });

  test('closes onto the entry the list had when it was opened from the list, so that Back leaves the list', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.goto('/customers');
    await checkouts.tab('Checkouts').click();
    await checkouts.expectLoaded();
    await checkouts.row('alice@acme.test').getByRole('cell').first().click();
    await expect(checkouts.detail()).toBeVisible();

    await checkouts.close();
    await expect(page).toHaveURL('/customers/checkout-sessions');

    await page.goBack();
    await expect(page).toHaveURL('/customers');
  });

  test('replaces its own entry when it came with the address, so that Back does not open it again', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await page.goto('/customers');
    await page.goto('/customers/checkout-sessions?session=cs-open');
    await expect(checkouts.detail()).toBeVisible();

    await checkouts.close();
    await expect(page).toHaveURL('/customers/checkout-sessions');

    await page.goBack();
    await expect(page).toHaveURL('/customers');
  });

  test('says a checkout is gone when the API has deleted it, and offers no retry', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-deleted');

    await expect(checkouts.gone()).toContainText('no longer exists');
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });

  test('never shows the token the visitor holds, nor a voucher code', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto('?session=cs-annual');
    await expect(checkouts.detail()).toBeVisible();

    const text = (await page.locator('body').textContent()) ?? '';
    expect(text).not.toMatch(/ksc_|WELCOME/);
  });
});

test.describe('the panel of a checkout, when the API refuses it', () => {
  test('shows the words of the API, and reads again on a retry', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    const model = createCheckoutSessionsBillingModel();
    model.checkoutSessions.armProblem('getCheckoutSessionAdmin', {
      code: 'GetCheckoutSessionAdmin.Unavailable',
      detail: 'The checkouts could not be read right now',
      status: 503,
    });
    await installBillingAppMocks(page, model);

    await checkouts.goto('?session=cs-open');

    await expect(checkouts.panel()).toContainText(
      'The checkouts could not be read right now',
    );
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(checkouts.detail()).toBeVisible();
    await expect(checkouts.detailRow('Email')).toContainText('dana@hooli.test');
  });
});

test.describe('the moments of a checkout, in the time zone of the browser', () => {
  test.use({ locale: 'en-US', timezoneId: 'Europe/Paris' });

  test('say which zone they are read in, as the service periods under them say theirs', async ({
    page,
  }) => {
    const checkouts = new CheckoutSessionsDriver(page);
    await installBillingAppMocks(page, createCheckoutSessionsBillingModel());

    await checkouts.goto('?session=cs-annual');

    await expect(checkouts.detailRow('Created')).toContainText('GMT+2');
    await expect(checkouts.detailRow('Expires')).toContainText('GMT+2');
    await expect(checkouts.detailRow('Trial')).toContainText('GMT+2');
    await expect(page.getByTestId('checkout-session-due-today')).toContainText(
      '(UTC)',
    );
  });
});
