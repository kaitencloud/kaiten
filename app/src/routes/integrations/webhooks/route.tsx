import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { WebhooksPageContent } from '@/features/webhooks';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/integrations/webhooks')({
  component: IntegrationsWebhooksLayout,
  // The parent of the list and the history, so one guard covers both: where the
  // deployment serves no webhooks (WEBHOOKS_FLAG off), the pages do not exist.
  // Fail-closed by construction: the flag's query resolves `false` rather than
  // throwing when the evaluation fails, so an unreachable flag source reads as
  // "not served" and lands here too, never on an error page.
  beforeLoad: async ({ context }) => {
    const webhooksServed = await context.queryClient.ensureQueryData(
      webhooksFlagQueryOptions,
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
