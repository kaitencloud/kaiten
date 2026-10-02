import { HttpResponse } from 'msw/http';
import {
  handleDeleteConnectorSettings,
  handleGetConnectorSettings,
  handleUpdateConnectorSettings,
} from '@/api-client/msw.gen';
import type { ConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import { connectorOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { graphqlOperationHandler, withErrorHandling } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const connectorHandlers = (
  model: ConnectorAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler(connectorOperations(model)),
  handleGetConnectorSettings(
    withErrorHandling('Unexpected connector mock error', () =>
      HttpResponse.json(model.getSettings()),
    ),
  ),
  handleUpdateConnectorSettings(
    withErrorHandling(
      'Unexpected connector mock error',
      async ({ request }) => {
        const settings = model.updateSettings(await request.json());
        persist();
        return HttpResponse.json(settings);
      },
    ),
  ),
  handleDeleteConnectorSettings(
    withErrorHandling('Unexpected connector mock error', () => {
      model.deleteSettings();
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
