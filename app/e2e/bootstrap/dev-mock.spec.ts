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

test('dev:mock answers every request of the billing screens of the instances, the customers and the settings', async ({
  page,
}) => {
  // Six screens, each compiled by the dev server on its first visit: a cold
  // server on a CI runner takes longer than the default 30 seconds.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.text().includes('[MSW] Unhandled API request:'))
      errors.push(message.text());
  });

  // An instance that bills: its subscription, the invoice it will issue, its invoices.
  await page.goto('/customers/instances/globex-production/billing');
  await expect(page.getByTestId('instance-invoices-count')).toBeVisible();
  // One that nobody bills yet, and the dialog that subscribes it with its prices.
  await page.goto('/customers/instances/gamma-production/billing/subscribe');
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: /Base price/ }),
  ).toBeVisible();
  // The journal of usage of a counter, a page of it.
  await page.goto(
    '/customers/instances/globex-production/entitlements?history=api-calls',
  );
  await expect(page.getByTestId('usage-history-count')).toBeVisible();
  // A customer with its billing e-mail and its invoices.
  await page.goto('/customers/globex');
  await expect(page.getByTestId('customer-invoices-count')).toBeVisible();
  // The settings of billing, and the export of the data.
  await page.goto('/settings/billing');
  await expect(page.getByTestId('billing-defaults')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByTestId('export-data')).toBeVisible();

  expect(errors).toEqual([]);
});
