import type { InstanceAddon, InstanceBilling, InvoiceLine } from '@/api-client';
import { buildInvoiceLine } from '../fixtures/build-invoice';

/**
 * The lines the add-ons of an instance put on the invoice of a boundary B, as the
 * composer of the API does, for the invoices the mocks compose:
 *
 * - a flat fee billed in advance, for each attachment active at B: the quantity held
 *   at B, for the period that starts at B;
 * - a flat fee billed in arrears, in full: one line for each add-on family that had an
 *   attachment at any time in `[P0, B)`, over the window it was held,
 *   `[max(P0, attachedAt), min(B, removedAt))`. The attachment is the one active at B,
 *   else the most recently removed, and a removed one bills the quantity it last had.
 *
 * The metered prices of an add-on are not rated here: a mock has no usage to rate, and a
 * metered price with nothing measured produces no line, so a world that wants one writes
 * it (`setUpcoming`, or an invoice it seeds).
 */

/** What a line is built from before it has a place on the invoice. */
export type AddonLineDraft = {
  /** Where the line starts, to order it among the others. */
  from: string;
  /** The place of its type among the others: base, add-on, usage, overage. */
  rank: number;
  line: (position: { invoiceId: string; seq: number }) => InvoiceLine;
};

export type BoundaryAddons = {
  /** Whether the period that ends at B is billed: not for a trial, which has none. */
  arrears: boolean;
  /** Every attachment the instance has had, the ones taken off included. */
  attachments: readonly InstanceAddon[];
  /** B: the boundary being composed. */
  boundary: string;
  billingPeriod: InstanceBilling['billingPeriod'];
  /** The end of the period that starts at B. */
  next: string;
  /** P0: the start of the period that ends at B. */
  periodStart: string;
};

const ADDON_RANK = 1;

const time = (instant: string) => Date.parse(instant);

const flatFee = (attached: InstanceAddon, timing: 'ADVANCE' | 'ARREARS') =>
  attached.prices.find(
    (price) =>
      price.billingModel === 'FLAT_FEE' &&
      price.billingTiming === timing &&
      price.status === 'ACTIVE',
  );

/**
 * The attachment of each family that bills in arrears at B: the one active at B, else
 * the most recently removed in `[P0, B)`. A family with no attachment in the period is
 * not there.
 */
function arrearsAttachments(input: BoundaryAddons): InstanceAddon[] {
  const inPeriod = input.attachments.filter(
    (attached) =>
      time(attached.attachedAt) < time(input.boundary) &&
      (attached.removedAt == null ||
        time(attached.removedAt) > time(input.periodStart)),
  );
  const chosen = new Map<string, InstanceAddon>();
  for (const attached of inPeriod) {
    const current = chosen.get(attached.familySlug);
    const beats =
      current === undefined ||
      (current.removedAt != null &&
        (attached.removedAt == null ||
          time(attached.removedAt) > time(current.removedAt)));
    if (beats) {
      chosen.set(attached.familySlug, attached);
    }
  }

  return [...chosen.values()];
}

/** The lines of the fees the add-ons of an instance are billed at B. */
export function composeAddonFeeLines(input: BoundaryAddons): AddonLineDraft[] {
  const drafts: AddonLineDraft[] = [];
  const period = input.billingPeriod.toLowerCase();

  for (const attached of input.attachments) {
    const fee = flatFee(attached, 'ADVANCE');
    if (!fee || attached.removedAt != null) {
      continue;
    }
    drafts.push({
      from: input.boundary,
      line: ({ invoiceId, seq }) =>
        buildInvoiceLine({
          addonId: attached.addonId,
          addonPriceId: fee.id,
          amount: Math.round(Number(fee.unitAmountDecimal)) * attached.quantity,
          description: `${attached.quantity} × ${fee.unitAmountDecimal} per ${period}`,
          instanceAddonId: attached.id,
          invoiceId,
          label: fee.displayLabel ?? `${attached.name} × ${attached.quantity}`,
          quantity: String(attached.quantity),
          seq,
          serviceFrom: input.boundary,
          serviceTo: input.next,
          type: 'ADDON',
          unitAmountDecimal: fee.unitAmountDecimal,
        }),
      rank: ADDON_RANK,
    });
  }
  if (!input.arrears) {
    return drafts;
  }
  for (const attached of arrearsAttachments(input)) {
    const fee = flatFee(attached, 'ARREARS');
    if (!fee) {
      continue;
    }
    const from = new Date(
      Math.max(time(input.periodStart), time(attached.attachedAt)),
    ).toISOString();
    const to = new Date(
      Math.min(
        time(input.boundary),
        time(attached.removedAt ?? input.boundary),
      ),
    ).toISOString();
    drafts.push({
      from,
      line: ({ invoiceId, seq }) =>
        buildInvoiceLine({
          addonId: attached.addonId,
          addonPriceId: fee.id,
          amount: Math.round(Number(fee.unitAmountDecimal)) * attached.quantity,
          billingTiming: 'ARREARS',
          description: `${attached.quantity} × ${fee.unitAmountDecimal} per ${period}`,
          instanceAddonId: attached.id,
          invoiceId,
          label: fee.displayLabel ?? `${attached.name} × ${attached.quantity}`,
          quantity: String(attached.quantity),
          seq,
          serviceFrom: from,
          serviceTo: to,
          type: 'ADDON',
          unitAmountDecimal: fee.unitAmountDecimal,
        }),
      rank: ADDON_RANK,
    });
  }

  return drafts;
}
