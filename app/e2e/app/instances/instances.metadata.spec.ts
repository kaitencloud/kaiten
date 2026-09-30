import { expect, test } from '../_support/app-test';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import {
  createDeployableInstanceModel,
  createTypedMetadataInstanceModel,
} from './instances.scenarios';

test.describe('instances metadata', () => {
  test('renders each declared field the way its schema types it', async ({
    page,
  }) => {
    const model = createTypedMetadataInstanceModel();
    const detail = new InstanceDetailDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('acme-production');
    await detail.expectLoaded('Acme Production');

    await expect(detail.metadataCard()).toBeVisible();
    // enum through its declared value, string verbatim, number formatted,
    // boolean as a check rather than the word "true".
    await detail.expectMetadataRow('Environment', 'production');
    await detail.expectMetadataRow('Region', 'eu-west-3');
    await detail.expectMetadataRow('Seats', '250');
    await detail.expectMetadataRow('Managed', '✓');

    // `reported_by_saas` is declared by no field. Instance metadata is
    // tolerant, so it is kept behind the raw-JSON dialog rather than dropped.
    await expect(detail.metadataCard()).toContainText('Extra metadata');
  });

  test('shows the empty state when the org declares no instance field', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const detail = new InstanceDetailDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('beta-staging');
    await detail.expectLoaded('Beta Staging');

    await expect(detail.metadataCard()).toContainText(
      'No metadata field declared',
    );
  });

  test('adds a metadata step to the create form and submits its values', async ({
    page,
  }) => {
    const model = createTypedMetadataInstanceModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await form.fillDetails({
      description: 'Regional production environment',
      name: 'Acme Europe',
    });
    await form.chooseCustomer('Acme Corp');
    await form.clickNext();
    await form.chooseLicense('Enterprise v2026.1');
    await form.clickNext();

    // Deployment is no longer the last step: the declared fields earn one more.
    await form.expectStepVisible('Deployment');
    await form.clickNext();

    await form.expectStepVisible('Metadata');
    await form.fillMetadataText('Region', 'eu-central-1');
    await form.clickCreate();

    await expect(page).toHaveURL('/customers/instances/acme-europe');
    await new InstanceDetailDriver(page).expectLoaded('Acme Europe');
    await list.goto();
    await list.expectInstanceVisible('Acme Europe');
    // The typed column reads the value back off the created instance.
    await expect(list.instanceRow('Acme Europe')).toContainText('eu-central-1');
  });

  test('keeps the deployment step last when no field is declared', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await form.fillDetails({
      description: 'No schema here',
      name: 'Acme Bare',
    });
    await form.chooseCustomer('Acme Corp');
    await form.clickNext();
    await form.chooseLicense('Enterprise v2026.1');
    await form.clickNext();

    await form.expectStepVisible('Deployment');
    await expect(form.createButton()).toBeVisible();
  });
});
