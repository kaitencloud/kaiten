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
  // Eleven screens, each compiled by the dev server on its first visit: a cold
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
