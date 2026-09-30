import { createFileRoute } from '@tanstack/react-router';
import {
  WebhookHistorySection,
  webhookHistoryQueryOptions,
  webhooksQueryOptions,
} from '@/features/webhooks';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/integrations/webhooks/history')({
  component: IntegrationsWebhooksHistoryRoute,
  beforeLoad: () => ({
    getTitle: () =>
      i18n.t('Pages.Integrations.Webhooks.Tabs.history', 'History'),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(webhookHistoryQueryOptions),
      context.queryClient.ensureQueryData(webhooksQueryOptions),
    ]),
});

function IntegrationsWebhooksHistoryRoute() {
  return <WebhookHistorySection />;
}
