import { createFileRoute } from '@tanstack/react-router';
import { DeploymentZoneDetailPeersTab } from '@/features/deployment-zones';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute(
  '/releases/deployment-zones_/$zoneSlug/peers',
)({
  component: DeploymentZoneDetailPeersRoute,
  beforeLoad: () => ({
    getTitle: () =>
      i18n.t('Pages.Releases.DeploymentZones.Detail.tabs.peers', 'Peers'),
  }),
});

function DeploymentZoneDetailPeersRoute() {
  return <DeploymentZoneDetailPeersTab />;
}
