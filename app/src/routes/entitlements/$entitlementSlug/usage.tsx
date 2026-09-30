import { createFileRoute } from '@tanstack/react-router';
import { EntitlementDetailUsageTab } from '@/features/entitlements';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/entitlements/$entitlementSlug/usage')({
  component: EntitlementDetailUsageRoute,
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.Entitlements.Detail.tabs.usage'),
  }),
});

function EntitlementDetailUsageRoute() {
  return <EntitlementDetailUsageTab />;
}
