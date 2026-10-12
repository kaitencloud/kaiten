import type { TFunction } from 'i18next';
import type {
  Provenance,
  ProvenanceAddon,
  ProvenanceBoost,
  ProvenanceLicense,
  ProvenanceNumber,
} from '@/api-client';

/**
 * A provenance as the API sends it. The OpenAPI document declares `license` and
 * `number` required and never null, while the handler sends null for a license that
 * does not grant the entitlement and for a number that no add-on and no voucher
 * changes (the identity case). Everything is read as if it could be absent or null.
 */
export type ServedProvenance = {
  addons?: readonly ProvenanceAddon[] | null;
  boosts?: readonly ProvenanceBoost[] | null;
  license?: ProvenanceLicense | null;
  number?: ProvenanceNumber | null;
};

// A `Provenance` is a `ServedProvenance`: the generated type is the narrower one.
export type { Provenance };

/** Who grants an entitlement without a limit. */
export type LimitSource = 'addon' | 'license' | 'voucher';

/**
 * One term of the arithmetic that gives a limit. The terms read from left to right as
 * a running total: what comes first is the base, and each next one applies to the
 * total so far.
 * - `license`: what the license grants;
 * - `addon`: what an attachment grants, `quantity` times. It adds to the total, or
 *   (`replace`) takes the place of the license's value;
 * - `highest`: the larger of its terms, where an add-on keeps the larger of its value
 *   and the base;
 * - `voucher`: what a boost does to the total: it sets it (`set`, in place of what the
 *   license and the add-ons give), adds to it or multiplies it. It never names a code.
 */
export type LimitTerm =
  | { amount: number; kind: 'license' }
  | {
      amount: number;
      kind: 'addon';
      operation: 'add' | 'replace' | 'raise';
      quantity: number;
    }
  | { kind: 'highest'; terms: LimitTerm[] }
  | { amount: number; kind: 'voucher'; operation: 'add' | 'multiply' | 'set' };

/** Why a limit is what it is: the terms that make it, or who leaves it unlimited. */
export type LimitExplanation =
  | { effective: number; kind: 'composed'; terms: LimitTerm[] }
  | { grantedBy: LimitSource[]; kind: 'unlimited' };

const UNLIMITED = -1;

const isNumberValue = (value: unknown): value is { value: number } =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: unknown }).type === 'number' &&
  typeof (value as { value?: unknown }).value === 'number';

const BEHAVIORS = new Set<string>(['ADD', 'MAX', 'OVERRIDE']);
const MODIFIERS = new Set<string>(['ADD', 'MULTIPLY', 'SET', 'UNLIMITED']);

/** What an attachment grants, or nothing when what it says cannot be read. */
function readAddon(
  addon: ProvenanceAddon,
): { amount: number; quantity: number } | null {
  if (
    !BEHAVIORS.has(addon.overrideBehavior) ||
    !isNumberValue(addon.value) ||
    !Number.isFinite(addon.quantity)
  ) {
    return null;
  }

  return { amount: addon.value.value, quantity: addon.quantity };
}

function readBoost(boost: ProvenanceBoost): number | null {
  if (!MODIFIERS.has(boost.modifierType)) {
    return null;
  }

  return typeof boost.modifierValue === 'number' ? boost.modifierValue : null;
}

function getGrantedBy(
  license: ProvenanceLicense | null | undefined,
  addons: readonly ProvenanceAddon[],
  boosts: readonly ProvenanceBoost[],
): LimitSource[] {
  const sources: LimitSource[] = [];

  if (isNumberValue(license?.value) && license.value.value === UNLIMITED) {
    sources.push('license');
  }
  if (
    addons.some(
      (addon) => isNumberValue(addon.value) && addon.value.value === UNLIMITED,
    )
  ) {
    sources.push('addon');
  }
  if (boosts.some((boost) => boost.modifierType === 'UNLIMITED')) {
    sources.push('voucher');
  }

  return sources;
}

/**
 * How the effective limit of a number is composed, from what the API says each layer
 * contributes (`Provenance`), in the order the API composes it: an OVERRIDE add-on
 * replaces the license's value (the latest attached wins), a MAX keeps the larger, an
 * ADD adds `quantity × value`; then the boosts, where a SET takes the place of all of
 * that, and the ADD and MULTIPLY boosts apply to it, the additions first.
 *
 * It is nothing, and the limit has no explanation to give, when:
 * - the API says nothing of how a number was composed (`number` is null: BOOLEAN and
 *   CONFIG, and a number that nothing but the license grants);
 * - a layer cannot be read, since an explanation that does not add up is worse than
 *   none.
 *
 * The total the explanation ends on is the API's (`number.effective`), never worked
 * out here.
 */
export function explainLimit(
  provenance: ServedProvenance | null | undefined,
): LimitExplanation | null {
  const number = provenance?.number;
  if (!provenance || !number) {
    return null;
  }
  const addons = provenance.addons ?? [];
  const boosts = provenance.boosts ?? [];

  if (number.unlimited) {
    return {
      grantedBy: getGrantedBy(provenance.license, addons, boosts),
      kind: 'unlimited',
    };
  }

  const terms: LimitTerm[] = [];
  if (typeof number.boostSet === 'number') {
    terms.push({
      amount: number.boostSet,
      kind: 'voucher',
      operation: 'set',
    });
  } else {
    const attached = addons.map((addon) => ({
      addon,
      read: readAddon(addon),
    }));
    if (attached.some(({ read }) => read === null)) {
      return null;
    }
    const grants = (behavior: ProvenanceAddon['overrideBehavior']) =>
      attached.flatMap(({ addon, read }) =>
        addon.overrideBehavior === behavior && read ? [read] : [],
      );
    // The latest attached OVERRIDE is the one that counts.
    const override = grants('OVERRIDE').at(-1);
    const hasLicense = typeof number.license === 'number';
    const base: LimitTerm[] = [];
    if (override) {
      base.push({
        amount: override.amount,
        kind: 'addon',
        operation: hasLicense ? 'replace' : 'add',
        quantity: override.quantity,
      });
    } else if (hasLicense) {
      base.push({ amount: number.license as number, kind: 'license' });
    }
    const raises = grants('MAX').map((grant): LimitTerm => ({
      amount: grant.amount,
      kind: 'addon',
      operation: 'raise',
      quantity: grant.quantity,
    }));
    // The larger of the base and every MAX grant; a MAX with nothing to compare it to
    // is the base.
    if (raises.length > 0 && base.length + raises.length > 1) {
      terms.push({ kind: 'highest', terms: [...base, ...raises] });
    } else {
      terms.push(...base, ...raises);
    }
    for (const grant of grants('ADD')) {
      terms.push({
        amount: grant.amount,
        kind: 'addon',
        operation: 'add',
        quantity: grant.quantity,
      });
    }
  }

  for (const operation of ['add', 'multiply'] as const) {
    const modifier = operation === 'add' ? 'ADD' : 'MULTIPLY';
    for (const boost of boosts) {
      if (boost.modifierType !== modifier) {
        continue;
      }
      const amount = readBoost(boost);
      if (amount === null) {
        return null;
      }
      terms.push({ amount, kind: 'voucher', operation });
    }
  }

  return terms.length === 0
    ? null
    : { effective: number.effective, kind: 'composed', terms };
}

const KEYS = {
  addon: 'Pages.Customers.Instances.Detail.entitlements.provenance.terms.addon',
  addonReplace:
    'Pages.Customers.Instances.Detail.entitlements.provenance.terms.addonReplace',
  highest:
    'Pages.Customers.Instances.Detail.entitlements.provenance.terms.highest',
  license:
    'Pages.Customers.Instances.Detail.entitlements.provenance.terms.license',
  sourceAddon:
    'Pages.Customers.Instances.Detail.entitlements.provenance.grantedBy.addon',
  sourceLicense:
    'Pages.Customers.Instances.Detail.entitlements.provenance.grantedBy.license',
  sourceVoucher:
    'Pages.Customers.Instances.Detail.entitlements.provenance.grantedBy.voucher',
  unlimited: 'Pages.Customers.Instances.Detail.entitlements.unlimited',
  unlimitedBy:
    'Pages.Customers.Instances.Detail.entitlements.provenance.unlimitedBy',
  voucher:
    'Pages.Customers.Instances.Detail.entitlements.provenance.terms.voucher',
  voucherSet:
    'Pages.Customers.Instances.Detail.entitlements.provenance.terms.voucherSet',
} as const;

const SOURCE_KEYS: Record<LimitSource, string> = {
  addon: KEYS.sourceAddon,
  license: KEYS.sourceLicense,
  voucher: KEYS.sourceVoucher,
};

type Format = { locale: string; t: TFunction };

const formatAmount = (amount: number, { locale }: Format) =>
  amount.toLocaleString(locale);

/** What a term is, without the sign that links it to the total before it. */
function formatOperand(term: LimitTerm, format: Format): string {
  const { t } = format;

  switch (term.kind) {
    case 'license':
      return t(KEYS.license, { amount: formatAmount(term.amount, format) });
    case 'addon': {
      // One unit is its value; several are "3 × 1,000".
      const amount =
        term.quantity === 1
          ? formatAmount(term.amount, format)
          : `${formatAmount(term.quantity, format)} × ${formatAmount(term.amount, format)}`;

      return t(term.operation === 'replace' ? KEYS.addonReplace : KEYS.addon, {
        amount,
      });
    }
    case 'highest':
      return t(KEYS.highest, {
        terms: term.terms
          .map((inner) => formatOperand(inner, format))
          .join(', '),
      });
    case 'voucher':
      return t(term.operation === 'set' ? KEYS.voucherSet : KEYS.voucher, {
        amount: formatAmount(term.amount, format),
      });
  }
}

/** The sign that applies a term to the total so far: the first term has none. */
function getSign(term: LimitTerm, index: number): string {
  if (index === 0) {
    return '';
  }
  if (term.kind === 'addon' && term.operation === 'add') {
    return '+ ';
  }
  if (term.kind === 'voucher') {
    return term.operation === 'multiply'
      ? '× '
      : term.operation === 'add'
        ? '+ '
        : '';
  }

  return '';
}

/**
 * An explanation as a sentence a person reads: "10,000 license + 3 × 1,000 add-on
 * × 2 voucher = 26,000", where each term applies to the total before it, or
 * "Unlimited, granted by an add-on". A voucher is never named by its code, which the
 * API does not send.
 */
export function formatLimitExplanation(
  explanation: LimitExplanation,
  format: Format,
): string {
  const { locale, t } = format;

  if (explanation.kind === 'unlimited') {
    if (explanation.grantedBy.length === 0) {
      return t(KEYS.unlimited);
    }
    const sources = new Intl.ListFormat(locale, {
      style: 'long',
      type: 'conjunction',
    }).format(explanation.grantedBy.map((source) => t(SOURCE_KEYS[source])));

    return t(KEYS.unlimitedBy, { sources });
  }
  const terms = explanation.terms
    .map(
      (term, index) => `${getSign(term, index)}${formatOperand(term, format)}`,
    )
    .join(' ');

  // A no-break space keeps the total with its sign, which a narrow popover would
  // otherwise leave alone at the end of a line.
  return `${terms} =\u00a0${formatAmount(explanation.effective, format)}`;
}
