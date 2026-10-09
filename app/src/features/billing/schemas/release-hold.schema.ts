import type { z } from 'zod';
import type { HoldRelease } from '@/api-client';
import { zHoldRelease } from '@/api-client/zod.gen';
import { reasonSchema } from '@/domains/billing';

/**
 * Releasing a held invoice accepts the figures as composed, which is audited:
 * the API requires the reason, and keeps it with who gave it.
 */
export const releaseHoldFormSchema = zHoldRelease
  .pick({ reason: true })
  .extend({ reason: reasonSchema });

export type ReleaseHoldFormValues = z.infer<typeof releaseHoldFormSchema>;

export const releaseHoldValuesToBody = (
  values: ReleaseHoldFormValues,
): HoldRelease => ({ reason: values.reason.trim() });
