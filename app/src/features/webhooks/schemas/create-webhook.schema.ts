import { z } from 'zod';

export const createWebhookFormSchema = z.object({
  eventTypes: z.array(z.string()).min(1, {
    message: 'Pages.Integrations.Webhooks.Dialog.eventsRequired',
  }),
  url: z
    .string()
    .trim()
    .min(1, {
      message: 'Pages.Integrations.Webhooks.Dialog.urlRequired',
    })
    .url({
      message: 'Pages.Integrations.Webhooks.Dialog.urlInvalid',
    }),
});

export type CreateWebhookFormValues = z.infer<typeof createWebhookFormSchema>;

export const initialCreateWebhookFormValues: CreateWebhookFormValues = {
  eventTypes: [],
  url: '',
};
