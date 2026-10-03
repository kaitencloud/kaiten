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
