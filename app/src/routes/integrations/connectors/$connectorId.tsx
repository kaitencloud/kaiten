import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  ATTIO_CONNECTOR,
  AttioConnectorDetail,
  attioSettingsQueryOptions,
} from '@/features/connectors';

export const Route = createFileRoute('/integrations/connectors/$connectorId')({
  component: IntegrationsConnectorDetailRoute,
  beforeLoad: () => ({
    getTitle: () => ATTIO_CONNECTOR.name,
  }),
  loader: async ({ context, params }) => {
    // V1 manages a single connector; anything else falls back to the index.
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
