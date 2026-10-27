import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  BillingNotFound,
  requireBillingCapability,
  STRIPE_CONNECTOR_ROUTE_ID,
} from '@/domains/billing';
import {
  ATTIO_CONNECTOR,
  AttioConnectorDetail,
  attioSettingsQueryOptions,
  STRIPE_CONNECTOR,
  StripeConnectorDetail,
  stripeSettingsQueryOptions,
} from '@/features/connectors';

export const Route = createFileRoute('/integrations/connectors/$connectorId')({
  component: IntegrationsConnectorDetailRoute,
  // Stripe is a billing connector: where billing is not there, a link to its page
  // explains why instead of failing.
  notFoundComponent: BillingNotFound,
  beforeLoad: async ({ context, params }) => {
    if (params.connectorId === STRIPE_CONNECTOR_ROUTE_ID) {
      await requireBillingCapability(context.queryClient);
    }

    return {
      getTitle: () =>
        params.connectorId === STRIPE_CONNECTOR_ROUTE_ID
          ? STRIPE_CONNECTOR.name
          : ATTIO_CONNECTOR.name,
    };
  },
  loader: async ({ context, params }) => {
    // Stripe is connected on its own page, so the page opens connected or not.
    if (params.connectorId === STRIPE_CONNECTOR_ROUTE_ID) {
      await context.queryClient.ensureQueryData(stripeSettingsQueryOptions);

      return;
    }
    // Attio is connected by the wizard of the index: the detail page needs it connected,
    // and anything else falls back to the index.
    if (params.connectorId !== 'attio') {
      throw redirect({ to: '/integrations/connectors' });
    }

    const attioSettings = await context.queryClient.ensureQueryData(
      attioSettingsQueryOptions,
    );
    if (attioSettings == null) {
      throw redirect({ to: '/integrations/connectors' });
    }
  },
});

function IntegrationsConnectorDetailRoute() {
  const { connectorId } = Route.useParams();

  return connectorId === STRIPE_CONNECTOR_ROUTE_ID ? (
    <StripeConnectorRoute />
  ) : (
    <AttioConnectorRoute />
  );
}

function StripeConnectorRoute() {
  const { data: stripeSettings } = useSuspenseQuery(stripeSettingsQueryOptions);

  return <StripeConnectorDetail stripeSettings={stripeSettings} />;
}

function AttioConnectorRoute() {
  const navigate = useNavigate();
  const { data: attioSettings } = useSuspenseQuery(attioSettingsQueryOptions);

  return (
    <AttioConnectorDetail
      attioSettings={attioSettings}
      onDisconnect={() => {
        navigate({ to: '/integrations/connectors' });
      }}
    />
  );
}
