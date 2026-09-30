import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/functionals/route-tabs';

const tabs = [
  {
    id: 'releases',
    to: '/releases',
  },
  {
    id: 'components',
    to: '/releases/components',
  },
  {
    id: 'deploymentZones',
    to: '/releases/deployment-zones',
  },
] as const;

export function ReleaseManagementTabs() {
  const { t } = useTranslation();

  const routeTabs = tabs.map((tab) => {
    return {
      id: tab.id,
      label: t(`Pages.Releases.tabs.${tab.id}`),
      to: tab.to,
    };
  });

  return <RouteTabs tabs={routeTabs} />;
}
