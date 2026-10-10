import { z } from 'zod';
import type { HandoffBooking } from '@/api-client';
import { zHandoffBooking } from '@/api-client/zod.gen';
import { EXTERNAL_REFERENCE_MAX_LENGTH } from './external-reference';

/**
 * Acknowledging a handed-off invoice by hand: the number the accounting system
 * gave it, which is optional. There is no lease to give: this is not the
 * consumer that claimed it.
 */
export const acknowledgeHandoffFormSchema = zHandoffBooking
  .pick({ externalReference: true })
  .extend({
    externalReference: z
      .string()
      .trim()
      .max(
        EXTERNAL_REFERENCE_MAX_LENGTH,
        'Features.Billing.MarkPaid.Errors.referenceTooLong',
      ),
  });

export type AcknowledgeHandoffFormValues = z.infer<
  typeof acknowledgeHandoffFormSchema
>;

/** Where a refusal of the API is shown on the form: on the one field it has. */
export const ACKNOWLEDGE_REFUSAL_FIELDS = {
  byCode: { 'AckHandoff.InvalidExternalReference': 'externalReference' },
  byLocation: { externalReference: 'externalReference' },
} as const;

export const initialAcknowledgeHandoffValues: AcknowledgeHandoffFormValues = {
  externalReference: '',
};

export const acknowledgeHandoffValuesToBody = (
  values: AcknowledgeHandoffFormValues,
): HandoffBooking => {
  const externalReference = values.externalReference.trim();

  return {
    externalReference: externalReference === '' ? undefined : externalReference,
  };
};
