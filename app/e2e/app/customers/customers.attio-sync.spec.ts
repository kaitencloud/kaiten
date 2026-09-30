import { ATTIO_CONNECTOR_NAME } from '@/domains/crm-sync/constants';
import { expect, expectToast, test } from '../_support/app-test';
import { CustomerDetailDriver } from '../_support/drivers/customer-detail.driver';
import { CustomerFormDriver } from '../_support/drivers/customer-form.driver';
import { CustomersListDriver } from '../_support/drivers/customers-list.driver';
import { ConnectorAppModel } from '../_support/model/connector-app-model';
import { CustomerAppModel } from '../_support/model/customer-app-model';
import { installConnectorAppMocks } from '../_support/mocks/install-connector-app-mocks';
import { installCustomerAppMocks } from '../_support/mocks/install-customer-app-mocks';

test('refreshes the new customer when the Attio integration appears asynchronously', async ({
  page,
}) => {
  // The integration appears on the third poll, two poll intervals after the
  // first: long enough for the pending state to show on the page creation
  // lands on.
  const customers = new CustomerAppModel({ attioSyncAfterAttempts: 3 });
  const connector = new ConnectorAppModel({
    settings: {
      connector_name: ATTIO_CONNECTOR_NAME,
      settings: {
        attioApiKey: '***',
        attioApiUrl: 'https://api.attio.com',
        fieldsMapping: {},
        syncPolicy: 'create-and-bind',
      },
    },
  });
  const list = new CustomersListDriver(page);
  const detail = new CustomerDetailDriver(page);
  const form = new CustomerFormDriver(page);

  await installCustomerAppMocks(page, customers);
  await installConnectorAppMocks(page, connector);
  await list.goto();
  await list.openCreateDialog();
  await form.fill({ externalCustomerId: 'crm-orbit-001', name: 'Orbit Labs' });
  await form.createButton().click();

  await expectToast(page, 'Customer created successfully');
  // Creation lands on the new customer, whose Attio card follows the sync
  // without a reload.
  await expect(page).toHaveURL('/customers/orbit-labs');
  await expect(detail.attioSyncStatus('In progress')).toBeVisible();
  await expect(detail.attioSyncStatus('Synced')).toBeVisible({
    timeout: 10_000,
  });

  // The list row the watcher refreshed carries the integration too.
  await detail.backToList();
  await expect(
    list.customerRow('Orbit Labs').getByLabel('Synced with Attio'),
  ).toBeVisible();
});
