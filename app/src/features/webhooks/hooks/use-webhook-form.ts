import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAppForm } from '@/hooks/form';
import {
  initialWebhookFormValues,
  webhookFormSchema,
} from '../schemas/webhook-form.schema';
import type { ApiWebhook } from '../types';
import { isOfferedType } from '../utils/webhook-event-selection';
import {
  formValuesToBody,
  webhookToFormValues,
} from '../utils/webhook-form-values';
import { useWebhookMutations } from './use-webhook-mutations';

type UseWebhookFormOptions = {
  /** The webhook to edit; absent, the form creates one. */
  webhook?: ApiWebhook;
};

/**
 * The create and edit page's form: one form for both modes. A create sends a
 * POST; an edit sends a PUT on a fresh read (`saveWebhookOnFresh`), with what
 * the form opened with kept as it was, so that a refetch while it is open does
 * not move the baseline. The mutations toast a refusal; a success toasts here
 * and goes back to the list.
 */
export function useWebhookForm({ webhook }: UseWebhookFormOptions = {}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { createWebhook, updateWebhook } = useWebhookMutations();
  const [openedValues] = useState(() =>
    webhook ? webhookToFormValues(webhook) : initialWebhookFormValues,
  );

  const form = useAppForm({
    defaultValues: openedValues,
    validators: { onChange: webhookFormSchema },
    onSubmit: async ({ value }) => {
      const body = formValuesToBody(webhookFormSchema.parse(value));
      try {
        if (webhook) {
          await updateWebhook.mutateAsync({
            webhookId: webhook.id,
            edited: body,
            opened: formValuesToBody(openedValues),
          });
        } else {
          await createWebhook.mutateAsync({ body });
        }
      } catch {
        // The mutation already showed the API's words; the form stays as typed.
        return;
      }
      // Outside the try: a failed navigation is not a refused save.
      toast.success(
        webhook
          ? t('Pages.Integrations.Webhooks.Form.updateSuccess')
          : t('Pages.Integrations.Webhooks.Form.createSuccess'),
      );
      await navigate({ to: '/integrations/webhooks' });
    },
  });

  function handleCancel() {
    void navigate({ to: '/integrations/webhooks' });
  }

  return {
    form,
    handleCancel,
    isEditMode: Boolean(webhook),
    // A webhook made outside the console without a filter receives every event.
    hasNoEventFilter: Boolean(webhook) && openedValues.eventTypes.length === 0,
    // What the webhook carries that the picker does not offer: kept, and
    // listed under "Other events" so that it can be removed.
    retainedTypes: openedValues.eventTypes.filter(
      (type) => !isOfferedType(type),
    ),
  };
}

/** The form the sections of the page take. */
export type WebhookFormApi = ReturnType<typeof useWebhookForm>['form'];
