import { expect, test } from '../_support/app-test';
import { InstanceDeploymentDialogDriver } from '../_support/drivers/instance-deployment-dialog.driver';
import { InstanceDetailDriver } from '../_support/drivers/instance-detail.driver';
import { InstanceFormDriver } from '../_support/drivers/instance-form.driver';
import { InstancesListDriver } from '../_support/drivers/instances-list.driver';
import { installInstanceAppMocks } from '../_support/mocks/install-instance-app-mocks';
import { createDeployableInstanceModel } from './instances.scenarios';

test.describe('instances deploy', () => {
  test('deploys an orphan instance from the list', async ({ page }) => {
    const model = createDeployableInstanceModel();
    const list = new InstancesListDriver(page);
    const dialog = new InstanceDeploymentDialogDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();

    // No zone yet, so the row offers a deployment rather than a migration.
    await expect(list.deployAction('Acme Production')).toBeVisible();
    await expect(list.migrateAction('Acme Production')).toHaveCount(0);

    await list.openDeployDialog('Acme Production');
    await dialog.expectTitle('Deploy Acme Production');
    await dialog.chooseZone('Production EU — production');
    await dialog.confirm('Deploy');
    await dialog.expectClosed();

    // The row now offers a migration: the instance carries a zone.
    await expect(list.migrateAction('Acme Production')).toBeVisible();
  });

  test('migrates an already deployed instance from the list', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const list = new InstancesListDriver(page);
    const dialog = new InstanceDeploymentDialogDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();

    await expect(list.migrateAction('Beta Staging')).toBeVisible();

    await list.openMigrateDialog('Beta Staging');
    await dialog.expectTitle('Migrate Beta Staging');
    await dialog.expectCurrentZone('Staging EU — staging');
    // The current zone is not offered as a target -- only the other one is.
    await dialog.chooseZone('Production EU — production');
    await dialog.confirm('Migrate');
    await dialog.expectClosed();

    // Reopening shows the target zone as the current one: the migration stuck.
    await list.openMigrateDialog('Beta Staging');
    await dialog.expectCurrentZone('Production EU — production');
  });

  test('deploys from the release card on the instance detail page', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const detail = new InstanceDetailDriver(page);
    const dialog = new InstanceDeploymentDialogDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('acme-production');
    await detail.expectLoaded('Acme Production');

    // No zone: the card drops its all-"Unknown" rows for an empty state whose
    // only affordance is deploying.
    await expect(detail.releaseEmptyState()).toBeVisible();
    await expect(detail.deployButton()).toBeVisible();

    await detail.deployButton().click();
    await dialog.expectTitle('Deploy Acme Production');
    await dialog.chooseZone('Staging EU — staging');
    await dialog.confirm('Deploy');
    await dialog.expectClosed();

    // The card reflects the new zone and now offers a migration instead.
    await detail.expectDeploymentZoneVisible('Staging EU');
    await expect(detail.migrateButton()).toBeVisible();
    await expect(detail.releaseEmptyState()).toHaveCount(0);
  });

  test('creates an instance already attached to a deployment zone', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await form.fillDetails({
      description: 'Regional production environment for Europe',
      name: 'Acme Europe',
    });
    await form.chooseCustomer('Acme Corp');
    await form.clickNext();
    await form.chooseLicense('Enterprise v2026.1');
    await form.clickNext();

    await form.expectStepVisible('Deployment');
    await form.chooseDeploymentZone('Production EU');
    await form.clickCreate();

    await expect(page).toHaveURL('/customers/instances/acme-europe');
    await new InstanceDetailDriver(page).expectLoaded('Acme Europe');
    await list.goto();
    // Created with a zone, so the row offers a migration from the start.
    await expect(list.migrateAction('Acme Europe')).toBeVisible();
    await expect(list.deployAction('Acme Europe')).toHaveCount(0);
  });

  test('lets the create form take the deployment zone back to none', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await form.fillDetails({
      description: 'Undecided about the zone',
      name: 'Acme Undecided',
    });
    await form.chooseCustomer('Acme Corp');
    await form.clickNext();
    await form.chooseLicense('Enterprise v2026.1');
    await form.clickNext();

    await form.expectStepVisible('Deployment');
    await form.chooseDeploymentZone('Production EU');
    await expect(form.deploymentZoneField()).toContainText('Production EU');

    // Picking a zone must stay undoable -- the field is optional and an
    // instance can be created orphan and deployed later.
    await form.clearDeploymentZone();
    await expect(form.deploymentZoneField()).not.toContainText('Production EU');

    await form.clickCreate();

    await expect(page).toHaveURL('/customers/instances/acme-undecided');
    await new InstanceDetailDriver(page).expectLoaded('Acme Undecided');
    await list.goto();
    // Created without a zone: the row offers a deployment, not a migration.
    await expect(list.deployAction('Acme Undecided')).toBeVisible();
    await expect(list.migrateAction('Acme Undecided')).toHaveCount(0);
  });

  test('lets the create form take the lifecycle stage back to none', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const list = new InstancesListDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await list.goto();
    await list.openCreateDialog();

    await form.fillDetails({
      description: 'Undecided about the stage',
      name: 'Acme Unstaged',
    });
    await form.chooseCustomer('Acme Corp');
    await form.chooseLifecycleStage('Trial');
    await expect(form.lifecycleStageField()).toContainText('Trial');

    await form.clearLifecycleStage();
    await expect(form.lifecycleStageField()).not.toContainText('Trial');

    await form.clickNext();
    await form.chooseLicense('Enterprise v2026.1');
    await form.clickNext();
    await form.expectStepVisible('Deployment');
    await form.clickCreate();

    await expect(page).toHaveURL('/customers/instances/acme-unstaged');
    await new InstanceDetailDriver(page).expectLoaded('Acme Unstaged');
    await list.goto();
    // Created with no stage: the lifecycle column stays empty rather than
    // carrying the value the user changed their mind about.
    await expect(list.instanceRow('Acme Unstaged')).not.toContainText('Trial');
  });

  test('refuses to detach a deployed instance from the edit form', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('beta-staging');
    await detail.expectLoaded('Beta Staging');
    await detail.startEdit();

    await form.clickNext();
    await form.clickNext();
    await form.expectStepVisible('Deployment');

    // Seeded from the instance, and no way back to none: the PUT reads an
    // omitted zone as "keep the current one", so detaching is not offered.
    await expect(form.deploymentZoneField()).toContainText('Staging EU');
    await form.deploymentZoneField().click();
    await expect(
      page.getByRole('option', { name: 'No deployment zone', exact: true }),
    ).toHaveCount(0);
  });

  test('moves a deployed instance to another zone from the edit form', async ({
    page,
  }) => {
    const model = createDeployableInstanceModel();
    const detail = new InstanceDetailDriver(page);
    const form = new InstanceFormDriver(page);

    await installInstanceAppMocks(page, model);
    await detail.goto('beta-staging');
    await detail.expectLoaded('Beta Staging');
    await detail.startEdit();

    await form.clickNext();
    await form.clickNext();
    await form.expectStepVisible('Deployment');
    await form.chooseDeploymentZone('Production EU');
    await form.updateButton().click();

    // The zone picked on the form has to reach the PUT -- it used to be
    // overwritten by the instance's current zone, which made the field inert.
    await detail.expectDeploymentZoneVisible('Production EU');
  });
});
