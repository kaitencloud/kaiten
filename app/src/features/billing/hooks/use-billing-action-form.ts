import { useId, useState } from 'react';
import type { z } from 'zod';
import { useAppForm } from '@/hooks/form';
import {
  placeRefusalOnFields,
  type RefusalFields,
} from '../utils/place-refusal';

type UseBillingActionFormOptions<TValues extends Record<string, string>> = {
  defaultValues: TValues;
  /** Where a refusal about one field is shown; any other is shown above the buttons. */
  fields?: RefusalFields;
  /** Closes the dialog, once the API accepted the request. */
  onClose: () => void;
  /** Asks the API with what was typed. It throws what the API refused with. */
  request: (values: TValues) => Promise<unknown>;
  /** The schema of the form, from the generated body of the request. */
  schema: z.ZodType<TValues, TValues>;
};

/**
 * The form of a dialog that asks the API for an audited action (releasing a hold,
 * marking an invoice paid, acknowledging a handoff). Submitting runs the request:
 * when the API accepts it the dialog closes, and when it refuses, the refusal is
 * shown where the person is looking, on its field or above the buttons, and the
 * dialog stays open with what was typed, since nothing was changed and it can be
 * sent again. `retry` sends the form again.
 */
export function useBillingActionForm<TValues extends Record<string, string>>({
  defaultValues,
  fields,
  onClose,
  request,
  schema,
}: UseBillingActionFormOptions<TValues>) {
  const formId = useId();
  const [failure, setFailure] = useState<unknown>(null);

  const form = useAppForm({
    defaultValues,
    onSubmit: async ({ formApi, value }) => {
      setFailure(null);
      try {
        await request(value);
        onClose();
      } catch (error) {
        if (!placeRefusalOnFields(formApi, error, fields)) {
          setFailure(error);
        }
      }
    },
    validators: { onChange: schema },
  });

  return { failure, form, formId, retry: () => void form.handleSubmit() };
}
