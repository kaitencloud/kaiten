import { createFileRoute } from '@tanstack/react-router';
import { WebhookList, webhooksQueryOptions } from '@/features/webhooks';

export const Route = createFileRoute('/integrations/webhooks/')({
  component: IntegrationsWebhooksEventRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(webhooksQueryOptions),
});

function IntegrationsWebhooksEventRoute() {
  return <WebhookList />;
}
