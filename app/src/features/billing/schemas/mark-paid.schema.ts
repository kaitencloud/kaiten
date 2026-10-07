import { z } from 'zod';
import type { InvoicePayment } from '@/api-client';
import { zInvoicePayment } from '@/api-client/zod.gen';
import { EXTERNAL_REFERENCE_MAX_LENGTH } from './external-reference';

// What a `datetime-local` input holds: a date, a time and no zone. The console
// reads it as UTC, as it writes every billing time.
const DATE_TIME_INPUT = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/;

/**
 * The instant a `datetime-local` value stands for, read as UTC and written as
 * the API takes it (`2027-03-03T10:00:00.000Z`). Null for an empty value or one
 * that is not a date and a time.
 */
export function dateTimeInputToInstant(value: string): string | null {
  const match = DATE_TIME_INPUT.exec(value.trim());
  if (!match) {
    return null;
  }
  const [, date, time, seconds = '00'] = match;
  const instant = new Date(`${date}T${time}:${seconds}.000Z`);

  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

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
