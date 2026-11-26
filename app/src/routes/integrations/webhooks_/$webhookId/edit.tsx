import { createFileRoute } from '@tanstack/react-router';
import { requireWebhooksServed } from '@/domains/webhooks';
import {
  loadWebhookForEdit,
  WebhookFormPage,
  webhookDisplayName,
} from '@/features/webhooks';

export const Route = createFileRoute('/integrations/webhooks_/$webhookId/edit')(
  {
    component: EditWebhookRoute,
    // `webhooks_` leaves the layout of the list and the history, and its guard
    // with it: the page asks for itself, then reads the webhook. An unknown id
    // fails with the API's 404, which the router shows as the not-found page.
    // The breadcrumb and the tab name the webhook by its host, never by its
    // URL: a Slack or Google Chat URL is a credential.
    beforeLoad: async ({ context, params: { webhookId } }) => {
      await requireWebhooksServed(context.queryClient);
      const webhook = await loadWebhookForEdit(context.queryClient, webhookId);

      return { webhook, getTitle: () => webhookDisplayName(webhook) };
    },
  },
);

function EditWebhookRoute() {
  const { webhook } = Route.useRouteContext();

  // Keyed by the webhook: the form keeps what it opened with, and another
  // webhook gets a fresh form.
  return <WebhookFormPage key={webhook.id} webhook={webhook} />;
}
