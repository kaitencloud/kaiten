import type { AiInference, Model } from '@/api-client';
import {
  type VendorCostResult,
  costPerCredit,
  margin,
  refundableCredits,
  steerOnCost,
  vendorCost,
  vendorCostDrift,
} from '../engine';

/** What a committed call cost at the vendor, and what that makes of its charge. */
export type ReceiptCostView = {
  /** The catalogue's costs of today applied to the usage. */
  vendor: VendorCostResult;
  /** The cost in USD the figures below are computed from. */
  computed: string | null;
  /** `STORED`: computed by the API at commit. `TODAY`: from today's catalogue. */
  computedSource: 'STORED' | 'TODAY';
  /** As the integration sent it with the commit. */
  reported: string | null;
  /** `reported − computed` when both exist and differ. */
  drift: string | null;
  /**
   * Today's catalogue costs part of the usage only: `computed` is a floor,
   * and no cost per credit or margin is derived from it.
   */
  partial: boolean;
  costPerCredit: string | null;
  /** On what the charge kept: `charged − refunded`. */
  margin: string | null;
  /** Refunds took something off the charge the margin is computed on. */
  marginAfterRefunds: boolean;
  creditValue: string | null;
};

export function costOf(
  inference: AiInference,
  model: Model | null,
  creditValue: string | null,
): ReceiptCostView | null {
  const stored = inference.vendorCost;
  if (inference.status !== 'COMMITTED' || (!model && !stored)) {
    return null;
  }
  const vendor = vendorCost(model?.vendorCosts, inference.usage);
  // What the API computed at commit is the record; today's catalogue is only
  // what an older row, which stores none, can be costed with.
  const computed = stored?.computed ?? (stored ? null : vendor.total);
  const reported = stored?.reported ?? null;
  const charged = inference.credits.charged;
  // A margin is on what the charge kept: a refund gave credits back, and the
  // vendor was paid all the same.
  const kept = refundableCredits(inference.credits);
  // What the API stored is taken as it is; a cost from today's catalogue is
  // only steered on when it covers the whole usage.
  const partial = !stored && steerOnCost(vendor, charged ?? null).partial;

  return {
    vendor,
    computed,
    computedSource: stored ? 'STORED' : 'TODAY',
    reported,
    drift: vendorCostDrift(reported, computed),
    partial,
    costPerCredit: partial ? null : costPerCredit(computed, charged),
    margin: partial
      ? null
      : margin({
          vendorUsd: computed,
          chargedCredits: kept,
          creditValue,
        }),
    marginAfterRefunds: refundableCredits({ charged }) !== kept,
    creditValue,
  };
}
