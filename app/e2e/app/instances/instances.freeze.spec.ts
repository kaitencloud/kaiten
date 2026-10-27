import { expect, expectToast, recordWrites, test } from '../_support/app-test';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { installBillingAppMocks } from '../_support/mocks/install-billing-app-mocks';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createSubscriptionsModel } from '../billing/billing.scenarios';
import { createBilledInstancesModel } from './instances.scenarios';

// While an instance is billed, an invoice is for one customer and one license
// version, so the API refuses to move either. It says so on the update, and only
// then, and the form puts the refusal where the person changed something.

const INSTANCE_WRITES = /\/api\/instances\/acme-production$/;

const FROZEN =
  'Instance "acme-production" has a live subscription: its customer and license cannot change until it is canceled';

test.describe('the customer and the license of an instance that bills', () => {
  test.beforeEach(async ({ page }) => {
    await installBillingAppMocks(page, createSubscriptionsModel());
    await installInstanceAppMocks(page, createBilledInstancesModel());
  });

  test('stay as they are: the customer is refused on its field, in the words of the API, with the way to the subscription', async ({
    page,
  }) => {
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);
    const writes = recordWrites(page, INSTANCE_WRITES, ['PUT']);

    await detail.goto('acme-production');
    await detail.startEdit();
    await form.chooseCustomer('Beta Industries');
    await form.clickNext();
    await form.clickNext();
    await form.updateButton().click();

    await expect(page.getByText(FROZEN, { exact: true })).toBeVisible();
    // One request for the one press of Save, and the refusal is not sent again.
    expect(writes).toHaveLength(1);
    // No toast: the refusal is on the field, and the person is taken back to it.
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
    await expect(form.nameField()).toBeVisible();
    await expect(page).toHaveURL(/\?mode=configure$/);

    await page
      .getByTestId('frozen-customerId')
      .getByRole('link', { name: 'Open the subscription' })
      .click();

    await expect(page).toHaveURL(
      /\/customers\/instances\/acme-production\/billing$/,
    );
  });

  test('stay as they are: the license is refused on its field, and the person is taken to its step', async ({
    page,
  }) => {
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);
    const writes = recordWrites(page, INSTANCE_WRITES, ['PUT']);

    await detail.goto('acme-production');
    await detail.startEdit();
    await form.clickNext();
    await form.chooseLicense('Growth v2026.2');
    await form.clickNext();
    await form.updateButton().click();

    await expect(page.getByText(FROZEN, { exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
    await expect(page.getByTestId('frozen-licenseSlug')).toBeVisible();
    await expect(page.getByTestId('frozen-customerId')).toHaveCount(0);
    await expect(form.licenseField()).toBeVisible();
  });

  test('can be put back, which takes the refusal away and lets the rest be saved', async ({
    page,
  }) => {
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await detail.goto('acme-production');
    await detail.startEdit();
    await form.chooseCustomer('Beta Industries');
    await form.clickNext();
    await form.clickNext();
    await form.updateButton().click();
    await expect(page.getByTestId('frozen-customerId')).toBeVisible();

    await form.chooseCustomer('Acme Corp');

    await expect(page.getByTestId('frozen-customerId')).toHaveCount(0);
    await expect(page.getByText(FROZEN, { exact: true })).toHaveCount(0);
    await form.fillDetails({ name: 'Acme Production EU' });
    await form.clickNext();
    await form.clickNext();
    await form.updateButton().click();

    await expectToast(page, 'Instance updated successfully');
    await detail.expectLoaded('Acme Production EU');
  });

  test('leave the name and the description free to change', async ({
    page,
  }) => {
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await detail.goto('acme-production');
    await detail.startEdit();
    await form.fillDetails({
      description: 'Primary environment',
      name: 'Acme Production EU',
    });
    await form.clickNext();
    await form.clickNext();
    await form.updateButton().click();

    await expectToast(page, 'Instance updated successfully');
    await detail.expectLoaded('Acme Production EU');
  });

  test('can change again once the subscription has ended', async ({ page }) => {
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await detail.goto('acme-legacy');
    await detail.startEdit();
    await form.chooseCustomer('Beta Industries');
    await form.clickNext();
    await form.clickNext();
    await form.updateButton().click();

    await expectToast(page, 'Instance updated successfully');
    await detail.expectCustomerVisible('Beta Industries');
  });
});
