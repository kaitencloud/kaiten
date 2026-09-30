import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  attioSettingsQueryOptions,
  ConnectorsPageContent,
  ConnectorsPageShell,
} from '@/features/connectors';

export const Route = createFileRoute('/integrations/connectors/')({
  component: IntegrationsConnectorsIndexRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(attioSettingsQueryOptions),
});

function IntegrationsConnectorsIndexRoute() {
  const navigate = useNavigate();
  const { data: attioSettings } = useSuspenseQuery(attioSettingsQueryOptions);

  return (
    <ConnectorsPageShell>
      <ConnectorsPageContent
        attioSettings={attioSettings}
        onOpenDetail={() => {
          navigate({
            to: '/integrations/connectors/$connectorId',
            params: { connectorId: 'attio' },
          });
        }}
      />
    </ConnectorsPageShell>
  );
}
