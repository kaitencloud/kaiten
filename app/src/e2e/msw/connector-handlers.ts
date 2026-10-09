import { HttpResponse } from 'msw/http';
import {
  handleDeactivateConnector,
  handleDeleteConnectorSettings,
  handleGetConnectorSettings,
  handleUpdateConnectorSettings,
} from '@/api-client/msw.gen';
import { STRIPE_CONNECTOR_NAME } from '@/domains/billing';
import type { ConnectorAppModel } from '../../../e2e/app/_support/model/connector-app-model';
import { connectorOperations } from '../../../e2e/app/_support/model/graphql-operations';
import { graphqlOperationHandler, withErrorHandling } from './handler-factory';
import { noop, type PersistMswState } from './persistence';

const isStripe = (connectorName: string) =>
  connectorName === STRIPE_CONNECTOR_NAME;

/**
 * The connectors API: Attio's settings, which the wizard writes and the detail
 * page reads, and Stripe's, which also carry its activation. Both go through the
 * same operations and tell each other apart by the name in the path.
 */
export const connectorHandlers = (
  model: ConnectorAppModel,
  persist: PersistMswState = noop,
) => [
  graphqlOperationHandler(connectorOperations(model)),
  handleGetConnectorSettings(
    withErrorHandling(
      'Unexpected connector mock error',
      ({ params }) =>
        HttpResponse.json(
          isStripe(params.connectorName)
            ? model.getStripeSettings()
            : model.getSettings(),
        ),
      // An armed refusal is spent by the call that met it.
      persist,
    ),
  ),
  handleUpdateConnectorSettings(
    withErrorHandling(
      'Unexpected connector mock error',
      async ({ params, request }) => {
        const body = await request.json();
        const settings = isStripe(params.connectorName)
          ? model.updateStripeSettings(body)
          : model.updateSettings(body);
        persist();
        return HttpResponse.json(settings);
      },
      persist,
    ),
  ),
  handleDeleteConnectorSettings(
    withErrorHandling(
      'Unexpected connector mock error',
      ({ params }) => {
        if (isStripe(params.connectorName)) {
          model.deleteStripeSettings();
        } else {
          model.deleteSettings();
        }
        persist();
        return new HttpResponse(null, { status: 204 });
      },
      persist,
    ),
  ),
  handleDeactivateConnector(
    withErrorHandling(
      'Unexpected connector mock error',
      ({ params }) => {
        if (isStripe(params.connectorName)) {
          model.deactivateStripe();
        }
        persist();
        return new HttpResponse(null, { status: 204 });
      },
      persist,
    ),
  ),
];
