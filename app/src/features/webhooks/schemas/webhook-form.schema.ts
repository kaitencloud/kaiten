import { z } from 'zod';

// The form of the create and edit page. The webhook endpoints are outside the
// OpenAPI contract (webhooks.api.ts), so there is no generated schema to start
// from. saas-api only refuses an empty URL; Svix decides the rest, so the form
// promises no more than an http or https URL.
export const webhookFormSchema = z.object({
  eventTypes: z.array(z.string()).min(1, {
    message: 'Pages.Integrations.Webhooks.Form.eventsRequired',
  }),
  url: z
    .string()
    .trim()
    .min(1, {
      message: 'Pages.Integrations.Webhooks.Form.urlRequired',
    })
    .url({
      protocol: /^https?$/,
      message: 'Pages.Integrations.Webhooks.Form.urlInvalid',
    }),
});

export type WebhookFormValues = z.infer<typeof webhookFormSchema>;

export const initialWebhookFormValues: WebhookFormValues = {
  eventTypes: [],
  url: '',
};
