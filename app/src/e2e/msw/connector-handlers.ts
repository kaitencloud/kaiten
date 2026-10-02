import { HttpResponse, http } from 'msw';
import type { ConnectorSettingsWritable } from '@/api-client';
import type { ConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import { connectorOperations } from '../../../e2e/app/_support/model/graphql-operations';
import {
  graphqlOperationHandler,
  parseRequestJson,
  withErrorHandling,
} from './handler-factory';
import { noop, type PersistMswState } from './persistence';

export const connectorHandlers = (
  model: ConnectorAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler(connectorOperations(model)),
  http.get(
    /\/api\/connectors\/[^/]+\/settings$/,
    withErrorHandling('Unexpected connector mock error', () =>
      HttpResponse.json(model.getSettings()),
    ),
  ),
  http.put(
    /\/api\/connectors\/[^/]+\/settings$/,
    withErrorHandling(
      'Unexpected connector mock error',
      async ({ request }) => {
        const settings = model.updateSettings(
          await parseRequestJson<ConnectorSettingsWritable>(request),
        );
        persist();
        return HttpResponse.json(settings);
      },
    ),
  ),
  http.delete(
    /\/api\/connectors\/[^/]+\/settings$/,
    withErrorHandling('Unexpected connector mock error', () => {
      model.deleteSettings();
      persist();
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
