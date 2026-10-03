import { expect, test } from '../_support/app-test';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';
import { createCustomersListModel } from '../customers/customers.scenarios';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';

test('reads, navigates and creates with a keyboard-driven dialog', async ({ page }) => {
  await installCustomerAppMocks(page, createCustomersListModel());
  const list = new CustomersListDriver(page);
  await list.goto();
  await list.expectCustomerVisible('Acme Corp');
  await list.openCreateDialog();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(list.createLink()).toBeFocused();
  await list.openCreateDialog();
  const form = new CustomerFormDriver(page);
  await form.fill({ name: 'Browser Customer', domain: 'browser.example', externalCustomerId: 'browser-1' });
  await form.createButton().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Browser Customer');
  await list.goto();
  await list.expectCustomerVisible('Browser Customer');
});
