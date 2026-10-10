import type {
  DiscountAllocation,
  InvoiceLine,
  Redemption,
  Voucher,
} from '@/api-client';
import { buildInvoiceLine } from '../fixtures/build-invoice';

/**
 * How a PRICE voucher becomes a negative line (spec 8.4), as the composer of the
 * API does it for an invoice: percentages first, in the order they were redeemed,
 * each taking its share of what its targets still amount to, then fixed amounts,
 * one line per voucher, each rounded half up as a magnitude, and the total floored
 * at nothing. It is the composer's arithmetic in the small, for the invoices the
 * mocks issue: the console never does any of it, it reads the line.
 */

/** A redemption of a PRICE voucher, with the voucher it redeemed. */
export type DiscountSource = {
  redemption: Redemption;
  voucher: Voucher;
};

export type ComposedDiscount = {
  line: InvoiceLine;
  /** The redemption the line is an application of: it has used one more invoice. */
  redemptionId: string;
};

const isTarget = (voucher: Voucher, line: InvoiceLine): boolean => {
  switch (voucher.priceAppliesTo) {
    case 'LICENSE_BASE':
      return line.type === 'BASE';
    case 'ADDONS':
      return line.type === 'ADDON';
    case 'BOTH':
      return line.type === 'BASE' || line.type === 'ADDON';
    case 'SELECTED_PRICES':
      return (
        (line.licensePriceId !== null &&
          voucher.applicableLicensePriceIds.includes(line.licensePriceId)) ||
        (line.addonPriceId !== null &&
          voucher.applicableAddonPriceIds.includes(line.addonPriceId))
      );
    default:
      return false;
  }
};

const redeemedBefore = (a: DiscountSource, b: DiscountSource) =>
  Date.parse(a.redemption.redeemedAt) - Date.parse(b.redemption.redeemedAt) ||
  a.redemption.id.localeCompare(b.redemption.id);

/** Whether a redemption discounts an invoice whose reference instant is `at`. */
export function appliesAt(
  source: DiscountSource,
  currency: string,
  at: number,
): boolean {
  const { redemption, voucher } = source;

  return (
    redemption.status === 'ACTIVE' &&
    voucher.voucherType === 'PRICE' &&
    Date.parse(redemption.redeemedAt) <= at &&
    Date.parse(redemption.effectiveStartsAt) <= at &&
    (redemption.effectiveExpiresAt === null ||
      at < Date.parse(redemption.effectiveExpiresAt)) &&
    (redemption.applicationsMax === null ||
      redemption.applicationsCount < redemption.applicationsMax) &&
    (voucher.priceDiscountType !== 'FIXED_AMOUNT' ||
      voucher.currency === currency)
  );
}

/**
 * What each target bears of a discount of `magnitude`: in proportion to what it
 * still amounts to, by ascending line, summing to the magnitude, and no target
 * discounted below nothing.
 */
function allocate(
  targets: ReadonlyArray<{ remaining: number; seq: number }>,
  magnitude: number,
): DiscountAllocation[] {
  const total = targets.reduce((sum, target) => sum + target.remaining, 0);
  const shares = targets.map((target) => ({
    ...target,
    exact: total === 0 ? 0 : (magnitude * target.remaining) / total,
  }));
  const parts = shares.map((share) => ({
    amount: Math.min(Math.floor(share.exact), Math.floor(share.remaining)),
    exact: share.exact,
    remaining: share.remaining,
    seq: share.seq,
  }));
  let left = magnitude - parts.reduce((sum, part) => sum + part.amount, 0);
  const byRemainder = [...parts].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  );
  for (const part of byRemainder) {
    if (left <= 0) {
      break;
    }
    if (part.amount < Math.floor(part.remaining)) {
      part.amount += 1;
      left -= 1;
    }
  }

  return parts
    .filter((part) => part.amount > 0)
    .sort((a, b) => a.seq - b.seq)
    .map((part) => ({ amount: part.amount, targetSeq: part.seq }));
}

/**
 * The DISCOUNT lines the redemptions of an invoice add to its other lines, which the
 * invoice numbers after them. `at` is the reference instant of the invoice.
 */
export function composeDiscounts({
  at,
  currency,
  invoiceId,
  lines,
  sources,
}: {
  at: number;
  currency: string;
  invoiceId: string;
  lines: readonly InvoiceLine[];
  sources: readonly DiscountSource[];
}): ComposedDiscount[] {
  const eligible = sources.filter((source) => appliesAt(source, currency, at));
  const ordered = [
    ...eligible
      .filter(({ voucher }) => voucher.priceDiscountType === 'PERCENTAGE')
      .sort(redeemedBefore),
    ...eligible
      .filter(({ voucher }) => voucher.priceDiscountType === 'FIXED_AMOUNT')
      .sort(redeemedBefore),
  ];
  const remaining = new Map(lines.map((line) => [line.seq, line.amount]));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const composed: Array<{
    allocations: DiscountAllocation[];
    base: number;
    magnitude: number;
    source: DiscountSource;
    targets: number[];
  }> = [];

  for (const source of ordered) {
    const { voucher } = source;
    const targets = lines.filter(
      (line) => isTarget(voucher, line) && (remaining.get(line.seq) ?? 0) > 0,
    );
    const base = targets.reduce(
      (sum, line) => sum + (remaining.get(line.seq) ?? 0),
      0,
    );
    const value = Number(voucher.priceDiscountValue);
    const raw =
      voucher.priceDiscountType === 'PERCENTAGE'
        ? (base * value) / 100
        : Math.min(value, base);
    const magnitude = Math.round(raw);
    if (targets.length === 0 || magnitude === 0) {
      continue;
    }
    const beforeThisOne = targets.map((line) => ({
      remaining: remaining.get(line.seq) ?? 0,
      seq: line.seq,
    }));
    if (voucher.priceDiscountType === 'PERCENTAGE') {
      for (const line of targets) {
        remaining.set(
          line.seq,
          (remaining.get(line.seq) ?? 0) * (1 - value / 100),
        );
      }
    } else {
      let left = raw;
      for (const line of targets) {
        const taken = Math.min(left, remaining.get(line.seq) ?? 0);
        remaining.set(line.seq, (remaining.get(line.seq) ?? 0) - taken);
        left -= taken;
      }
    }
    composed.push({
      allocations: allocate(beforeThisOne, magnitude),
      base: Math.round(base),
      magnitude,
      source,
      targets: targets.map((line) => line.seq),
    });
  }

  // The total floors at nothing: the last discounts give back what the rounding took.
  let excess =
    composed.reduce((sum, discount) => sum + discount.magnitude, 0) - subtotal;
  for (let index = composed.length - 1; excess > 0 && index >= 0; index -= 1) {
    const give = Math.min(excess, composed[index].magnitude);
    composed[index].magnitude -= give;
    excess -= give;
  }

  const first = lines[0];
  const lastSeq = lines.reduce((top, line) => Math.max(top, line.seq), 0);

  return composed
    .filter((discount) => discount.magnitude > 0)
    .map((discount, index) => {
      const { redemption, voucher } = discount.source;
      const seq = lastSeq + index + 1;
      const targetLines = lines.filter((line) =>
        discount.targets.includes(line.seq),
      );
      const percentage = voucher.priceDiscountType === 'PERCENTAGE';
      const from = targetLines.reduce(
        (earliest, line) =>
          Date.parse(line.serviceFrom) < Date.parse(earliest)
            ? line.serviceFrom
            : earliest,
        (targetLines[0] ?? first).serviceFrom,
      );
      const to = targetLines.reduce(
        (latest, line) =>
          Date.parse(line.serviceTo) > Date.parse(latest)
            ? line.serviceTo
            : latest,
        (targetLines[0] ?? first).serviceTo,
      );

      return {
        line: buildInvoiceLine({
          amount: -discount.magnitude,
          description: percentage
            ? `${voucher.priceDiscountValue}% of ${discount.base}`
            : `${voucher.priceDiscountValue} off ${discount.base}`,
          discount: {
            allocations: discount.allocations,
            application: redemption.applicationsCount + 1,
            applicationsMax: redemption.applicationsMax,
            appliesTo: voucher.priceAppliesTo ?? 'LICENSE_BASE',
            base: String(discount.base),
            currency: percentage ? null : (voucher.currency ?? null),
            discountType: voucher.priceDiscountType ?? 'PERCENTAGE',
            discountValue: voucher.priceDiscountValue ?? '0',
            targetSeqs: discount.targets,
          },
          instanceVoucherId: redemption.id,
          invoiceId,
          label: voucher.name,
          seq,
          serviceFrom: from,
          serviceTo: to,
          type: 'DISCOUNT',
          voucherId: voucher.id,
        }),
        redemptionId: redemption.id,
      };
    });
}
