import type { QueryClient } from '@tanstack/react-query';
import { voucherQueryOptions } from './voucher-query-options';
import { warmVoucherReferences } from './voucher-reference-query-options';

/**
 * What the wizard's route loads before it draws. The pickers of the Offer step and the
 * eligibility step read what a voucher refers to, and nothing before them does, so the
 * wizard opens without waiting for it: the reads start now and are in the cache by the
 * time a person reaches the step. A boost opens on the Offer step, for the discount it
 * goes with, and waits for them so that its pickers are full when it appears.
 */
export async function loadVoucherWizard(
  queryClient: QueryClient,
  boostFor: string | undefined,
) {
  const references = warmVoucherReferences(queryClient);

  if (!boostFor) {
    return undefined;
  }

  const [voucher] = await Promise.all([
    queryClient.ensureQueryData(voucherQueryOptions(boostFor)),
    references,
  ]);

  return voucher;
}
