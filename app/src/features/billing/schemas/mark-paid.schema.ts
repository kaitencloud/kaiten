import { z } from 'zod';
import type { InvoicePayment } from '@/api-client';
import { zInvoicePayment } from '@/api-client/zod.gen';
import { dateTimeInputToInstant } from '@/lib/date-time-input';
import { EXTERNAL_REFERENCE_MAX_LENGTH } from './external-reference';

const isPastOrNow = (value: string) => {
  const instant = dateTimeInputToInstant(value);

  return instant === null || Date.parse(instant) <= Date.now();
};

/**
 * Recording a payment. The reference to the accounting system comes first, since
 * it is what the invoice is found by there; the note carries the reference of the
 * payment itself, and is kept only in the event. Nothing is required: a payment
 * recorded with nothing else is paid now, and acknowledges what waited in the
 * handoff queue.
 */
export const markPaidFormSchema = zInvoicePayment.pick({ note: true }).extend({
  externalReference: z
    .string()
    .trim()
    .max(
      EXTERNAL_REFERENCE_MAX_LENGTH,
      'Features.Billing.MarkPaid.Errors.referenceTooLong',
    ),
  note: z.string().max(1000, 'Features.Billing.MarkPaid.Errors.noteTooLong'),
  paidAt: z
    .string()
    .refine(
      (value) => value === '' || dateTimeInputToInstant(value) !== null,
      'Features.Billing.MarkPaid.Errors.paidAtInvalid',
    )
    .refine(isPastOrNow, 'Features.Billing.MarkPaid.Errors.paidAtInFuture'),
});

export type MarkPaidFormValues = z.infer<typeof markPaidFormSchema>;

/**
 * Where a refusal of the API is shown on the form. The API names the field in
 * prose and, for a reference that is too long, does not locate it: the code says
 * which it is, and the message goes on that field, where the person is looking.
 */
export const MARK_PAID_REFUSAL_FIELDS = {
  byCode: {
    'MarkInvoicePaid.InvalidExternalReference': 'externalReference',
    'MarkInvoicePaid.PaidAtInFuture': 'paidAt',
  },
  byLocation: {
    externalReference: 'externalReference',
    note: 'note',
    paidAt: 'paidAt',
  },
} as const;

export const initialMarkPaidValues: MarkPaidFormValues = {
  externalReference: '',
  note: '',
  paidAt: '',
};

/** The body of the payment: only what was filled in, since an empty field is not a value. */
export function markPaidValuesToBody(
  values: MarkPaidFormValues,
): InvoicePayment {
  const externalReference = values.externalReference.trim();
  const note = values.note.trim();
  const paidAt = dateTimeInputToInstant(values.paidAt);

  return {
    externalReference: externalReference === '' ? undefined : externalReference,
    note: note === '' ? undefined : note,
    paidAt: paidAt ?? undefined,
  };
}
