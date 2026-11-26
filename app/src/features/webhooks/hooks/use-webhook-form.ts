import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAppForm } from '@/hooks/form';
import {
  initialWebhookFormValues,
  type WebhookFormValues,
  webhookFormSchema,
} from '../schemas/webhook-form.schema';
import type { ApiWebhook } from '../types';
import { isOfferedType } from '../utils/webhook-event-selection';
import {
  formValuesToBody,
  isUnchangedWebhook,
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

  // Save has nothing to send while the body is the one the page opened with.
  // TanStack Form's `isDirty` stays set once a field changed, and its
  // `isDefaultValue` would count the events ticked while "keep every event"
  // is on, which are not sent.
  const isUnchanged = useCallback(
    (values: WebhookFormValues) => isUnchangedWebhook(values, openedValues),
    [openedValues],
  );

  return {
    form,
    handleCancel,
    isEditMode: Boolean(webhook),
    isUnchanged,
    // A webhook without a filter receives every event: its edit page offers to
    // keep it that way. Only an edit opens with the box ticked.
    hasNoEventFilter: openedValues.keepEveryEvent,
    // What the webhook carries that the picker does not offer: kept, and
    // listed under "Other events" so that it can be removed.
    retainedTypes: openedValues.eventTypes.filter(
      (type) => !isOfferedType(type),
    ),
  };
}

/** The form the sections of the page take. */
export type WebhookFormApi = ReturnType<typeof useWebhookForm>['form'];
