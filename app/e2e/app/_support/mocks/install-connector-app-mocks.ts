import type { Page } from '@playwright/test';
import type { ConnectorSettingsWritable } from '@/api-client';
import type { ConnectorAppModel } from '../model/connector-app-model';
import { connectorOperations } from '../model/graphql-operations';
import { installGraphQLOperationMocks } from './graphql-operation-router';
import { tryInstallMswMocks } from './install-app-mocks';
import { makeRestRouter, parseJsonBody } from './rest-route-helpers';

export async function installConnectorAppMocks(
  page: Page,
  model: ConnectorAppModel,
) {
  if (await tryInstallMswMocks(page, 'connectors', model)) {
    return;
  }

  await page.route(
    '**/api/connectors/*/settings',
    makeRestRouter(
      [
        {
          method: 'GET',
          segments: 4,
          handle: () => model.getSettings(),
        },
        {
          method: 'PUT',
          segments: 4,
          handle: ({ route }) =>
            model.updateSettings(
              parseJsonBody<ConnectorSettingsWritable>(route),
            ),
        },
        {
          method: 'DELETE',
          segments: 4,
          handle: () => model.deleteSettings(),
        },
      ],
      { errorMessage: 'Unexpected connector mock error' },
    ),
  );

  await installGraphQLOperationMocks(page, connectorOperations(model));
}
