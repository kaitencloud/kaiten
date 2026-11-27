import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { requireWebhooksServed } from '@/domains/webhooks';
import { WebhooksPageContent } from '@/features/webhooks';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/integrations/webhooks')({
  component: IntegrationsWebhooksLayout,
  // The parent of the list and the history, so one guard covers both. The
  // create and edit pages (webhooks_/) leave this layout and call it themselves.
  beforeLoad: async ({ context }) => {
    await requireWebhooksServed(context.queryClient);

    return {
      getTitle: () =>
        i18n.t('Pages.Integrations.Webhooks.sectionTitle', 'Webhooks'),
    };
  },
});

function IntegrationsWebhooksLayout() {
  return (
    <WebhooksPageContent>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </WebhooksPageContent>
  );
}
