import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type {
  EntitlementUsage,
  InvoicePreview,
  Redemption,
  Validity,
} from '@/api-client';
import {
  getEntitlementsUsageMetricsOptions,
  redeemVoucherMutation,
  validateVoucherMutation,
} from '@/api-client/@tanstack/react-query.gen';
import {
  invalidateInstanceVoucherQueries,
  useBoundaryRetry,
} from '@/domains/billing';
import { upcomingInvoiceQueryOptions } from '../queries';
import {
  diffEffectiveValues,
  type EffectiveChange,
} from '../utils/instance-addons.utils';

/** A code that was checked against the instance, with what the API said of it. */
export type CheckedCode = {
  code: string;
  validity: Validity;
};

/**
 * What redeeming did, as far as the console can show: the redemption, the entitlements
 * whose effective value moved (a boost applies at once), and the invoice the next boundary
 * will issue before and after (a discount shows on it). Both are read from the API on
 * either side of the redemption and never worked out here: how a boost adds to what the
 * license grants, and how a discount composes with the others, are the API's.
 */
export type RedeemOutcome = {
  changes: EffectiveChange[];
  invoice: { after: InvoicePreview; before: InvoicePreview } | null;
  redemption: Redemption;
};

/**
 * Applies a code to an instance in two steps, as the dialog shows them: the code is
 * checked first (`POST /vouchers/validate` with the instance, which also runs the checks
 * that need it), and only a code the API called valid can be redeemed. The code lives in
 * this hook's state and the body of the two requests, nowhere else: not in a key, not in
 * the address, not in a storage. One request goes out at a time. A period being closed is
 * waited out and the redemption is sent once more after it, as every change to an instance
 * that bills is. Any other refusal is kept as the failure, with the dialog still open and
 * the code as typed.
 */
export function useRedeemVoucher(instanceSlug: string) {
  const queryClient = useQueryClient();
  const validate = useMutation(validateVoucherMutation());
  const redeem = useMutation(redeemVoucherMutation());
  const { closing, send } = useBoundaryRetry();
  const [checked, setChecked] = useState<CheckedCode | null>(null);
  const [outcome, setOutcome] = useState<RedeemOutcome | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const busy = useRef(false);

  async function check(code: string) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setFailure(null);
    setChecked(null);
    try {
      const validity = await validate.mutateAsync({
        body: { code, instanceSlug },
      });

      setChecked({ code, validity });
    } catch (error) {
      setFailure(error);
    } finally {
      busy.current = false;
    }
  }

  async function readState() {
    const usage = getEntitlementsUsageMetricsOptions({
      path: { instanceSlug },
    });
    const invoice = upcomingInvoiceQueryOptions(instanceSlug);
    const [usageNow, invoiceNow] = await Promise.all([
      queryClient
        .fetchQuery({ ...usage, staleTime: 0 })
        .catch((): EntitlementUsage[] | undefined => undefined),
      queryClient
        .fetchQuery({ ...invoice, staleTime: 0 })
        .catch((): InvoicePreview | null => null),
    ]);

    return { invoice: invoiceNow, usage: usageNow };
  }

  async function confirm() {
    if (!checked?.validity.valid || busy.current) {
      return;
    }
    busy.current = true;
    setFailure(null);
    try {
      const before = await readState();
      const redemption = await send(() =>
        redeem.mutateAsync({
          body: { code: checked.code },
          path: { instanceSlug },
        }),
      );

      await invalidateInstanceVoucherQueries(
        queryClient,
        instanceSlug,
        redemption.voucherId,
      );
      const after = await readState();

      setOutcome({
        changes:
          redemption.voucherType === 'ENTITLEMENT_BOOST'
            ? diffEffectiveValues(
                before.usage ?? undefined,
                after.usage ?? undefined,
              )
            : [],
        invoice:
          redemption.voucherType === 'PRICE' && before.invoice && after.invoice
            ? { after: after.invoice, before: before.invoice }
            : null,
        redemption,
      });
    } catch (error) {
      setFailure(error);
    } finally {
      busy.current = false;
    }
  }

  return {
    check,
    checked,
    closing,
    confirm,
    failure,
    outcome,
    pending: validate.isPending || redeem.isPending,
    /** Forgets the verdict and the failure: the code was changed, and they were about the old one. */
    reset: () => {
      setChecked(null);
      setFailure(null);
    },
  };
}
