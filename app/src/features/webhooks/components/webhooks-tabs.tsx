import { useTranslation } from 'react-i18next';
import { RouteTabs } from '@/functionals/route-tabs';

const tabs = [
  {
    id: 'event',
    to: '/integrations/webhooks',
  },
  {
    id: 'history',
    to: '/integrations/webhooks/history',
  },
] as const;

export function WebhooksTabs() {
  const { t } = useTranslation();

  function mapTab(tab: (typeof tabs)[number]) {
    return {
      id: tab.id,
      label: t(`Pages.Integrations.Webhooks.Tabs.${tab.id}`),
      to: tab.to,
    };
  }

  return <RouteTabs tabs={tabs.map(mapTab)} />;
}
