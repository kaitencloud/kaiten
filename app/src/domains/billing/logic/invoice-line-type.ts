import type { InvoiceLine } from '@/api-client';

/** What an invoice line bills (`InvoiceLine.type`). */
export type InvoiceLineType = InvoiceLine['type'];

export const INVOICE_LINE_TYPES = [
  'BASE',
  'ADDON',
  'USAGE',
  'OVERAGE',
  'DISCOUNT',
] as const satisfies readonly InvoiceLineType[];

const LINE_TYPE_LABEL_KEYS = {
  BASE: 'Features.Billing.InvoiceLineType.BASE',
  ADDON: 'Features.Billing.InvoiceLineType.ADDON',
  USAGE: 'Features.Billing.InvoiceLineType.USAGE',
  OVERAGE: 'Features.Billing.InvoiceLineType.OVERAGE',
  DISCOUNT: 'Features.Billing.InvoiceLineType.DISCOUNT',
} as const satisfies Record<InvoiceLineType, string>;

/** The label of a type this version of the console does not know. */
const UNKNOWN_LINE_TYPE_LABEL_KEY = 'Features.Billing.InvoiceLineType.unknown';

export function isKnownInvoiceLineType(type: string): type is InvoiceLineType {
  return (INVOICE_LINE_TYPES as readonly string[]).includes(type);
}

export type InvoiceLineKind = {
  /** The type, or `UNKNOWN` for one the console does not know. */
  type: InvoiceLineType | 'UNKNOWN';
  /** The type as the API sent it, which an unknown one is shown as. */
  rawType: string;
  labelKey: string;
  /**
   * A USAGE or OVERAGE line: measured from the usage journal, so it carries a
   * fingerprint of the reports it came from and a drill-down to them.
   */
  isMetered: boolean;
  /** A DISCOUNT line, which is negative and has no price of its own. */
  isDiscount: boolean;
  /**
   * Whether the line has a price to show (billing model, timing, unit amount):
   * a DISCOUNT line has none, and an ADDON line has no licence price. The
   * contract leaves these members optional on every line.
   */
  hasPrice: boolean;
};

/**
 * What a screen needs to know to render a line of an invoice. The schema of a
 * line is open, so a type the console does not know renders as it was sent
 * rather than failing the invoice.
 */
export function describeInvoiceLine(line: { type: string }): InvoiceLineKind {
  const rawType = line.type;

  if (!isKnownInvoiceLineType(rawType)) {
    return {
      hasPrice: false,
      isDiscount: false,
      isMetered: false,
      labelKey: UNKNOWN_LINE_TYPE_LABEL_KEY,
      rawType,
      type: 'UNKNOWN',
    };
  }

  return {
    hasPrice: rawType !== 'DISCOUNT',
    isDiscount: rawType === 'DISCOUNT',
    isMetered: rawType === 'USAGE' || rawType === 'OVERAGE',
    labelKey: LINE_TYPE_LABEL_KEYS[rawType],
    rawType,
    type: rawType,
  };
}
