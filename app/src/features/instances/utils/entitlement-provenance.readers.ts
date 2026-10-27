import type {
  ProvenanceAddon,
  ProvenanceBoost,
  ProvenanceLicense,
} from '@/api-client';
import type { LimitSource } from './entitlement-provenance.utils';

const UNLIMITED = -1;

export const isNumberValue = (value: unknown): value is { value: number } =>
  typeof value === 'object' &&
  value !== null &&
  (value as { type?: unknown }).type === 'number' &&
  typeof (value as { value?: unknown }).value === 'number';

const BEHAVIORS = new Set<string>(['ADD', 'MAX', 'OVERRIDE']);
const MODIFIERS = new Set<string>(['ADD', 'MULTIPLY', 'SET', 'UNLIMITED']);

type ReadGrant = { amount: number; quantity: number };

/** What an attachment grants, or nothing when what it says cannot be read. */
export function readAddon(addon: ProvenanceAddon): ReadGrant | null {
  if (
    !BEHAVIORS.has(addon.overrideBehavior) ||
    !isNumberValue(addon.value) ||
    !Number.isFinite(addon.quantity)
  ) {
    return null;
  }

  return { amount: addon.value.value, quantity: addon.quantity };
}

export function readBoost(boost: ProvenanceBoost): number | null {
  if (!MODIFIERS.has(boost.modifierType)) {
    return null;
  }

  return typeof boost.modifierValue === 'number' ? boost.modifierValue : null;
}

export function getGrantedBy(
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
