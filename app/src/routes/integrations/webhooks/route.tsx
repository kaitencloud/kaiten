import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { webhooksServedQueryOptions } from '@/domains/webhooks';
import { WebhooksPageContent } from '@/features/webhooks';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/integrations/webhooks')({
  component: IntegrationsWebhooksLayout,
  // The parent of the list and the history, so one guard covers both: where
  // webhooks are not served to this organization -- a self-hosted deployment,
  // or a licence that does not carry them -- the pages do not exist. Where the
  // answer could not be read, the query throws and the router renders its
  // retryable error page rather than claiming the pages do not exist.
  beforeLoad: async ({ context }) => {
    const webhooksServed = await context.queryClient.ensureQueryData(
      webhooksServedQueryOptions,
    );
    if (!webhooksServed) {
      throw notFound();
    }

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
