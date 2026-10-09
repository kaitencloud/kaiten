import { expect, test } from '@playwright/test';

test('dev:mock boots its own world and reads it after reload without a stack', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('[MSW] Unhandled API request:'))
      errors.push(message.text());
  });
  await page.goto('/customers');
  await expect(
    page.getByRole('heading', { name: 'Customers', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Gamma Labs', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('cell', { name: 'Acme Corp', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('dev:mock answers every request of the billing screens of the instances, the customers, the add-ons and the settings', async ({
  page,
}) => {
  // Twelve screens, each compiled by the dev server on its first visit: a cold
  // server on a CI runner takes longer than the default 30 seconds.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('[MSW] Unhandled API request:'))
      errors.push(message.text());
  });

  // An instance that bills: its subscription, the invoice it will issue, its invoices.
  await page.goto('/customers/instances/globex-production/billing');
  await expect(
    page.locator('a[href^="/billing/invoices/"]').first(),
  ).toBeVisible();
  // One that nobody bills yet, and the dialog that subscribes it with its prices.
  await page.goto('/customers/instances/gamma-production/billing/subscribe');
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: /Base price/ }),
  ).toBeVisible();
  // The add-ons an instance holds, and the dialog that adds one with the price of each.
  await page.goto('/customers/instances/globex-staging/billing');
  await expect(page.getByTestId('instance-addons')).toBeVisible();
  await page.goto('/customers/instances/globex-staging/billing/attach-addon');
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: /Add-on/ })
    .click();
  await page.getByRole('option').first().click();
  await expect(page.getByTestId('attach-addon-details')).toBeVisible();
  // The catalogue of add-ons, and what a version grants, is sold for and fits.
  await page.goto('/addons');
  await expect(
    page.getByRole('heading', { name: 'Add-ons', level: 1 }),
  ).toBeVisible();
  await page.goto('/addons/extra-seats/entitlements');
  await expect(
    page.getByRole('row').filter({ hasText: 'Seats' }),
  ).toBeVisible();
  await page.goto('/addons/extra-seats/prices');
  await expect(
    page.getByRole('row').filter({ hasText: 'Extra seat, monthly' }),
  ).toBeVisible();
  await page.goto('/addons/extra-seats/compatibility');
  await expect(
    page.getByRole('list', { name: 'License families' }),
  ).toBeVisible();
  // The seats of an instance that holds add-ons and redeemed a boost say how their limit is
  // composed, and a limit only the license grants is a figure.
  await page.goto('/customers/instances/globex-staging/entitlements');
  await page
    .getByRole('button', { name: /limit of Seats is composed/ })
    .first()
    .click();
  await expect(page.getByTestId('limit-provenance')).toHaveText(
    /^10 license \+ 2 × 5 add-on × 2 voucher =\s40$/,
  );
  const calls = page.getByRole('row').filter({ hasText: 'API Calls' });
  await expect(calls).toBeVisible();
  await expect(calls.getByTestId('limit-provenance-trigger')).toHaveCount(0);
  // The journal of usage of a counter, a page of it.
  await page.goto(
    '/customers/instances/globex-production/entitlements?history=api-calls',
  );
  await expect(page.getByTestId('usage-history-reports')).toBeVisible();
  // A customer with its billing e-mail and its invoices.
  await page.goto('/customers/globex');
  await expect(
    page.locator('a[href^="/billing/invoices/"]').first(),
  ).toBeVisible();
  // The settings of billing, and the export of the data.
  await page.goto('/settings/billing');
  await expect(page.getByTestId('billing-defaults')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByTestId('export-data')).toBeVisible();

  expect(errors).toEqual([]);
});

test('dev:mock answers every request of the vouchers, of what an instance redeemed and of the invoice a discount is on', async ({
  page,
}) => {
  // Seven screens, each compiled by the dev server on its first visit.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('[MSW] Unhandled API request:'))
      errors.push(message.text());
  });

  // The catalogue of vouchers, and the opening of one by the code someone sends.
  await page.goto('/vouchers');
  await expect(
    page.getByRole('heading', { name: 'Vouchers', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'Launch discount' }),
  ).toBeVisible();
  // A voucher with its code, what it does in words and the instances that redeemed it.
  await page.goto('/vouchers/voucher-launch');
  await expect(page.getByTestId('voucher-code')).not.toHaveValue('');
  await expect(page.getByTestId('voucher-summary')).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'globex-staging' }),
  ).toBeVisible();
  // The wizard reads the entitlements a boost can change.
  await page.goto('/vouchers/new');
  await page.getByRole('button', { name: /^Boost/ }).click();
  await page.getByLabel(/^Name/).fill('More of everything');
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: /Add a change/ }).click();
  await page
    .getByTestId('voucher-grant-row')
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('option').first()).toBeVisible();
  // What an instance redeemed, and the dialog that checks a code against it.
  await page.goto('/customers/instances/globex-staging/billing');
  await expect(page.getByTestId('instance-vouchers')).toBeVisible();
  await page.goto(
    '/customers/instances/globex-production/billing/redeem-voucher',
  );
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Voucher code/).fill('double-seats-globex');
  await dialog.getByRole('button', { name: /^Check the code/ }).click();
  await expect(page.getByTestId('redeem-verdict-valid')).toBeVisible();
  // The invoice a discount is on, with how the discount was composed.
  await page.goto('/billing/invoices/inv-acme-production-activation');
  await expect(page.getByTestId('invoice-line-discount')).toBeVisible();

  expect(errors).toEqual([]);
});

test('dev:mock answers every request of Stripe: its connector, the health of billing, an invoice it collects, the provider of a contract and the payment method of a customer', async ({
  page,
}) => {
  // Eight screens, each compiled by the dev server on its first visit.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('[MSW] Unhandled API request:'))
      errors.push(message.text());
  });

  // The tile of the connectors, among the connected ones, and the page of the connector,
  // whose key is a password that is never read back.
  await page.goto('/integrations/connectors');
  await expect(
    page.getByRole('button', { name: 'Manage' }).first(),
  ).toBeVisible();
  await page.goto('/integrations/connectors/stripe');
  await expect(page.getByTestId('stripe-settings')).toBeVisible();
  await expect(page.getByLabel('Restricted API key')).toHaveAttribute(
    'type',
    'password',
  );
  // Where Stripe stands in the settings of billing, and what needs attention.
  await page.goto('/settings/billing');
  await expect(page.getByTestId('billing-provider-stripe')).toContainText(
    'Connected',
  );
  await expect(page.getByTestId('billing-provider-sync')).toBeVisible();
  await expect(
    page
      .getByTestId('billing-health-tiles')
      .or(page.getByTestId('billing-health-clear')),
  ).toBeVisible();
  // An invoice Stripe collects, how its amounts compare, and one whose push failed.
  await page.goto('/billing/invoices/inv-acme-us-renewal-2');
  await expect(page.getByTestId('invoice-provider-links')).toBeVisible();
  await expect(page.getByTestId('reconciliation')).toContainText('Differ');
  await page.goto('/billing/invoices/inv-acme-us-renewal-4');
  await expect(page.getByTestId('invoice-push-error')).toBeVisible();
  // The provider of a contract that Stripe collects, and the invoices still open.
  await page.goto('/customers/instances/acme-us/billing/terms');
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: /Collected by/ }),
  ).toBeVisible();
  // The payment method of two customers, and the portal that follows from it.
  await page.goto('/customers/globex');
  await expect(page.getByTestId('payment-method')).toContainText(
    'Visa ending in 4242',
  );
  await page.goto('/customers/acme-corp');
  await expect(page.getByTestId('payment-method')).toContainText(
    'Last charge failed',
  );

  expect(errors).toEqual([]);
});

test('dev:mock answers every request of the publishable keys: the list with and without the revoked ones, the page of the dialogs and the Integrations entry', async ({
  page,
}) => {
  // Four screens, each compiled by the dev server on its first visit.
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('[MSW] Unhandled API request:'))
      errors.push(message.text());
  });

  // The keys of the world: live ones and revoked ones, only their last four characters.
  await page.goto('/integrations/publishable-keys');
  await expect(
    page.getByRole('heading', { name: 'Publishable keys', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({ hasText: 'Pricing page' }),
  ).toContainText('…x9Qa');
  await expect(
    page.getByRole('row').filter({ hasText: 'Docs site' }),
  ).toHaveCount(0);
  // Billing is on, so the section of the navigation lists the page.
  await expect(
    page
      .locator('[data-sidebar="content"]')
      .getByRole('link', { name: 'Publishable keys', exact: true }),
  ).toBeVisible();
  await page.getByRole('switch', { name: 'Include revoked' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Docs site' }),
  ).toContainText('Revoked');
  // A key issued is shown once, and listed by its last four characters after.
  await page.goto('/integrations/publishable-keys/new');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Label/).fill('Checkout');
  await dialog.getByRole('button', { name: 'Create key' }).click();
  await expect(dialog.getByTestId('created-key')).toHaveValue(/^pk_/);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: 'Checkout' }),
  ).toBeVisible();
  // And one is changed, from its own address.
  await page.goto(
    '/integrations/publishable-keys/publishable-key-staging/edit',
  );
  await expect(page.getByRole('dialog').getByLabel(/^Label/)).toHaveValue(
    'Staging storefront',
  );

  expect(errors).toEqual([]);
});
