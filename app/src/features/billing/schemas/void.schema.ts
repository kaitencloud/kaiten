import type { z } from 'zod';
import type { InvoiceVoid } from '@/api-client';
import { zInvoiceVoid } from '@/api-client/zod.gen';
import { reasonSchema } from '@/domains/billing';

/** Voiding an invoice frees its boundary for a replacement, and says why. */
export const voidFormSchema = zInvoiceVoid
  .pick({ reason: true })
  .extend({ reason: reasonSchema });

export type VoidFormValues = z.infer<typeof voidFormSchema>;

export const voidValuesToBody = (values: VoidFormValues): InvoiceVoid => ({
  reason: values.reason.trim(),
});
