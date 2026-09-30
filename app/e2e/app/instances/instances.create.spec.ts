import { expect, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  createCustomerScopedInstanceModel,
  createEmptyInstancesModel,
} from './instances.scenarios';

test.describe('instances create', () => {
  test('creates an instance from the global list dialog', async ({ page }) => {
    const model = createEmptyInstancesModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await expect(page).toHaveURL('/customers/instances/new');
    await expect(
      page.getByText('New Instance', { exact: true }).first(),
    ).toBeVisible();
    await expect(form.nextButton()).toBeDisabled();

    await form.fillDetails({
      description: 'Regional production environment for Europe',
      name: 'Acme Europe',
    });
    await form.chooseCustomer('Acme Corp');
    await form.clickNext();

    await form.expectStepVisible('Choose the license');
    await expect(form.nextButton()).toBeDisabled();

    await form.chooseLicense('Enterprise v2026.1');
    await form.clickNext();

    await form.expectStepVisible('Deployment');
    await form.clickCreate();

    // Creating lands on the new instance, not back on the list.
    await expect(page).toHaveURL('/customers/instances/acme-europe');
    await new InstanceDetailDriver(page).expectLoaded('Acme Europe');
    await list.goto();
    await list.expectInstanceVisible('Acme Europe');
  });

  test('creates an instance from the customer-scoped dialog with a locked customer', async ({
    page,
  }) => {
    const model = createCustomerScopedInstanceModel();
    const customerDetail = new CustomerDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await customerDetail.goto('acme-corp');
    await customerDetail.expectLoaded('Acme Corp');

    await customerDetail.openCreateInstanceDialog();

    await expect(page).toHaveURL('/customers/acme-corp/instances/new');
    await expect(
      page.getByText('New Instance', { exact: true }).first(),
    ).toBeVisible();
    await expect(form.customerField()).toBeDisabled();
    await expect(form.customerField()).toContainText('Acme Corp');

    await form.fillDetails({
      description: 'Sandbox environment for regional onboarding',
      name: 'Acme Sandbox',
    });
    await form.clickNext();
    await form.chooseLicense('Growth v2026.2');
    await form.clickNext();
    await form.clickCreate();

    // Even from its customer, creating lands on the new instance.
    await expect(page).toHaveURL('/customers/instances/acme-sandbox');
    await new InstanceDetailDriver(page).expectLoaded('Acme Sandbox');
    await customerDetail.goto('acme-corp');
    await customerDetail.expectLoaded('Acme Corp');
    await customerDetail.expectInstanceVisible('Acme Sandbox');
  });
});
