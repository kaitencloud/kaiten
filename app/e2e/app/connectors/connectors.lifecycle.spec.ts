import { expect, test } from '../_support/app-test';
import { ConnectorsDriver } from '../_support/drivers/connectors.driver';
import { installConnectorAppMocks } from '../_support/mocks/install-connector-app-mocks';
import { createDisconnectedAttioModel } from './connectors.scenarios';

test('connects, displays synced records and disconnects Attio', async ({
  page,
}) => {
  const model = createDisconnectedAttioModel();
  const connectors = new ConnectorsDriver(page);

  await installConnectorAppMocks(page, model);
  await connectors.goto();
  await connectors.openWizard();
  await connectors.connect('atk_live_e2e_token');
  await connectors.expectDetail();

  await expect(page.getByText('Acme Corp')).toBeVisible();
  await expect(page.getByText('Acme Production')).toBeVisible();

  await connectors.disconnect();

  await expect(page).toHaveURL(/\/integrations\/connectors\/?$/);
  await expect(page.getByText('Attio connector disconnected.')).toBeVisible();
});
