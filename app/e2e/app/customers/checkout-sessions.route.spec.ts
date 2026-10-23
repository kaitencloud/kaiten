import { expect, test } from '../_support/app-test';
import { CheckoutSessionsDriver } from '../_support/drivers/checkout-sessions.driver';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import {
  CHECKOUT_NOW,
  createCheckoutSessionsBillingModel,
  createCheckoutSessionsCustomersModel,
} from './checkout-sessions.scenarios';

// The list of checkouts is `/customers/checkout-sessions`, and a customer's page is
// `/customers/<slug>`: the router matches a static segment before a parameter, so a
// customer whose slug is `checkout-sessions` (the API takes any slug) has the list at its
// address. The customers below include one. The console never makes one, and reaches an
// existing one at `/overview`, the same page.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(CHECKOUT_NOW));
  await installCustomerAppMocks(page, createCheckoutSessionsCustomersModel());
  await installBillingAppMocks(page, createCheckoutSessionsBillingModel());
});

test.describe('a customer whose slug is the path of the list of checkouts', () => {
  test('leaves that path to the list of checkouts', async ({ page }) => {
    const checkouts = new CheckoutSessionsDriver(page);

    await checkouts.goto();

    await expect(page).toHaveURL('/customers/checkout-sessions');
    await expect(checkouts.rows()).toHaveCount(6);
    await expect(page.getByText('Customer details')).toHaveCount(0);
  });

  test('is reached from the list of customers, at the address of its page under /overview', async ({
    page,
  }) => {
    const list = new CustomersListDriver(page);

    await list.goto();
    const row = list.customerRow('Checkout Sessions Ltd');

    await expect(row.getByRole('link').first()).toHaveAttribute(
      'href',
      '/customers/checkout-sessions/overview',
    );
    await row.click();
    await expect(page).toHaveURL('/customers/checkout-sessions/overview');
    await new CustomerDetailDriver(page).expectLoaded('Checkout Sessions Ltd');
  });

  test('has its page and its edit dialog at /overview', async ({ page }) => {
    const detail = new CustomerDetailDriver(page);

    await page.goto('/customers/checkout-sessions/overview');
    await detail.expectLoaded('Checkout Sessions Ltd');

    await page.goto('/customers/checkout-sessions/overview?mode=configure');
    await expect(
      page.getByRole('button', { name: 'Update Customer' }),
    ).toBeVisible();
  });

  test('is sent from /edit to that edit dialog, not to the list', async ({
    page,
  }) => {
    await page.goto('/customers/checkout-sessions/edit');

    await expect(page).toHaveURL(
      '/customers/checkout-sessions/overview?mode=configure',
    );
    await expect(
      page.getByRole('button', { name: 'Update Customer' }),
    ).toBeVisible();
  });

  test('is not made by the form, whether the slug follows the name or is typed', async ({
    page,
  }) => {
    const form = new CustomerFormDriver(page);

    await page.goto('/customers/new');
    await form.fill({ name: 'Checkout Sessions' });

    await expect(page.getByLabel('Slug')).toHaveValue('checkout-sessions');
    await expect(
      page.getByText('This slug is the address of a page of the console'),
    ).toBeVisible();
    await expect(form.createButton()).toBeDisabled();

    // Cleared, the slug is the one the API makes from the name: the same refusal.
    await page.getByLabel('Slug').fill('');
    await expect(
      page.getByText('This slug is the address of a page of the console'),
    ).toBeVisible();
    await expect(form.createButton()).toBeDisabled();

    await page.getByLabel('Slug').fill('checkout-sessions-ltd');
    await expect(
      page.getByText('This slug is the address of a page of the console'),
    ).toHaveCount(0);
    await expect(form.createButton()).toBeEnabled();
  });
});

test.describe('a customer whose slug is not shadowed', () => {
  test('keeps its page at /customers/<slug>', async ({ page }) => {
    const list = new CustomersListDriver(page);

    await list.goto();

    await expect(
      list.customerRow('Bought Online').getByRole('link').first(),
    ).toHaveAttribute('href', '/customers/bought-online');
  });
});
