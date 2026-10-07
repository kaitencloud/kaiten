import type { z } from 'zod';
import type { InvoiceWriteOff } from '@/api-client';
import { zInvoiceWriteOff } from '@/api-client/zod.gen';
import { reasonSchema } from './invoice-reason';

/** Writing an invoice off gives up collecting it, and says why. */
export const writeOffFormSchema = zInvoiceWriteOff
  .pick({ reason: true })
  .extend({ reason: reasonSchema });

export type WriteOffFormValues = z.infer<typeof writeOffFormSchema>;

export const writeOffValuesToBody = (
  values: WriteOffFormValues,
): InvoiceWriteOff => ({ reason: values.reason.trim() });
