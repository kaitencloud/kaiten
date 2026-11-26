import { z } from 'zod';

// The form of the create and edit page. The webhook endpoints are outside the
// OpenAPI contract (webhooks.api.ts), so there is no generated schema to start
// from. saas-api only refuses an empty URL; Svix decides the rest, so the form
// promises no more than an http or https URL.
//
// `keepEveryEvent` is only ever true on the edit page of a webhook that has no
// event filter: saas-api accepts an update without events for such a webhook
// alone, and it then keeps receiving every event. Everywhere else the webhook
// needs at least one event, as saas-api refuses an empty filter on a create and
// on a webhook that has one.
export const webhookFormSchema = z
  .object({
    keepEveryEvent: z.boolean(),
    eventTypes: z.array(z.string()),
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
  })
  .superRefine((values, context) => {
    if (!values.keepEveryEvent && values.eventTypes.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['eventTypes'],
        message: 'Pages.Integrations.Webhooks.Form.eventsRequired',
      });
    }
  });

export type WebhookFormValues = z.infer<typeof webhookFormSchema>;

export const initialWebhookFormValues: WebhookFormValues = {
  keepEveryEvent: false,
  eventTypes: [],
  url: '',
};
