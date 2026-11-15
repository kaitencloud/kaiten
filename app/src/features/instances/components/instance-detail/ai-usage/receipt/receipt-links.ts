import { rateCardCellOf } from '@/domains/ai-credits';
import type { ReceiptView } from './receipt-view';

/** The rate card's search for one cell: `/ai/pricing?pool&version&type&cell`. */
export type RateCardCellSearch = {
  pool: string;
  version: string;
  type: ReceiptView['inference']['requestType'];
  cell: string;
};

export type ReceiptAction =
  | { kind: 'OPEN_RULE'; search: RateCardCellSearch }
  | { kind: 'PRICE_IT'; search: RateCardCellSearch }
  | { kind: 'OPEN_MODEL'; modelSlug: string }
  | { kind: 'OPEN_MODELS' };

function versionOf(view: ReceiptView): string | null {
  const rule =
    view.pricing && 'rule' in view.pricing ? view.pricing.rule : null;

  return rule?.licenseSlug ?? view.licence?.slug ?? null;
}

/**
 * Where a receipt leads: the rate-card cell of the rule that priced the call
 * (its model's row, or the wildcard row), the cell to price for a call no
 * rule priced, or the catalogue for an unknown or archived model.
 */
export function receiptAction(view: ReceiptView): ReceiptAction | null {
  const version = versionOf(view);
  const base = { pool: view.pool.slug, type: view.inference.requestType };
  if (view.kind === 'UNAUTHORIZED') {
    if (view.denialReason === 'NO_RULE' && view.model && version) {
      return {
        kind: 'PRICE_IT',
        search: {
          ...base,
          version,
          cell: rateCardCellOf(version, view.model.slug),
        },
      };
    }
    if (view.denialReason === 'MODEL_ARCHIVED' && view.model) {
      return { kind: 'OPEN_MODEL', modelSlug: view.model.slug };
    }

    if (view.denialReason === 'UNKNOWN_MODEL') {
      // Known since: the model that now answers to the name, else the catalogue.
      return view.knownSince && view.model
        ? { kind: 'OPEN_MODEL', modelSlug: view.model.slug }
        : { kind: 'OPEN_MODELS' };
    }

    return null;
  }
  const specificity = view.pricing?.specificity ?? null;
  if (!version || !specificity) {
    return null;
  }
  // The row stores the slug it resolved to, for when the catalogue is not read.
  const wildcard = !specificity.startsWith('EXACT');
  const modelSlug = view.model?.slug ?? view.inference.modelSlug ?? null;

  return wildcard || modelSlug
    ? {
        kind: 'OPEN_RULE',
        search: {
          ...base,
          version,
          cell: rateCardCellOf(version, wildcard ? null : modelSlug),
        },
      }
    : null;
}
