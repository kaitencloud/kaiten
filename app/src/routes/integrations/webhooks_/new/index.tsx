import { createFileRoute } from '@tanstack/react-router';
import { requireWebhooksServed } from '@/domains/webhooks';
import { WebhookFormPage } from '@/features/webhooks';

export const Route = createFileRoute('/integrations/webhooks_/new/')({
  component: NewWebhookRoute,
  // The catalogue is static: nothing to load, so nothing to show while waiting.
  pendingComponent: () => null,
  // `webhooks_` leaves the layout of the list and the history, and its guard
  // with it: the page asks for itself.
  beforeLoad: ({ context }) => requireWebhooksServed(context.queryClient),
});

function NewWebhookRoute() {
  return <WebhookFormPage />;
}
