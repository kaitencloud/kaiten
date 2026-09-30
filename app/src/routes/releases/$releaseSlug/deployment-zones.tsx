import { createFileRoute } from '@tanstack/react-router';
import { ReleaseDetailDeploymentZonesTab } from '@/features/releases';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/releases/$releaseSlug/deployment-zones')(
  {
    component: ReleaseDetailDeploymentZonesRoute,
    beforeLoad: () => ({
      getTitle: () =>
        i18n.t(
          'Pages.Releases.Detail.tabs.deploymentZones',
          'Deployment Zones',
        ),
    }),
  },
);

function ReleaseDetailDeploymentZonesRoute() {
  return <ReleaseDetailDeploymentZonesTab />;
}
