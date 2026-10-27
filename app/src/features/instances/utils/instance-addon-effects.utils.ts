import type { TFunction } from 'i18next';
import type { Entitlement } from '@/api-client';
import { formatNumber } from '@/lib/format-date';
import type { EffectiveChange, EffectiveValue } from './instance-addons.utils';

const KEYS = {
  change: 'Pages.Customers.Instances.Detail.Billing.Addons.Effect.change',
  configured:
    'Pages.Customers.Instances.Detail.Billing.Addons.Effect.configured',
  disabled: 'Pages.Customers.Instances.Detail.entitlements.status.disabled',
  enabled: 'Pages.Customers.Instances.Detail.entitlements.status.enabled',
  none: 'Pages.Customers.Instances.Detail.Billing.Addons.Effect.none',
  unlimited: 'Pages.Customers.Instances.Detail.entitlements.unlimited',
} as const;

/**
 * An effective value as it is read: a number with its thousands separators (-1 is
 * unlimited), a flag as enabled or not, a configuration as configured, and what the
 * instance is not granted at all as such.
 */
export function formatEffectiveValue(
  value: EffectiveValue,
  t: TFunction,
): string {
  switch (value?.type) {
    case 'number':
      return value.value === -1
        ? t(KEYS.unlimited)
        : formatNumber(Number(value.value));
    case 'boolean':
      return t(value.value ? KEYS.enabled : KEYS.disabled);
    case 'object':
      return t(KEYS.configured);
    default:
      return t(KEYS.none);
  }
}

/** One change as a line: the entitlement by its name, and its value before and after. */
export function describeEffectiveChange(
  change: EffectiveChange,
  entitlements: readonly Pick<Entitlement, 'name' | 'slug'>[],
  t: TFunction,
): string {
  const entitlement = entitlements.find(
    ({ slug }) => slug === change.entitlementSlug,
  );

  return t(KEYS.change, {
    after: formatEffectiveValue(change.after, t),
    before: formatEffectiveValue(change.before, t),
    entitlement: entitlement?.name ?? change.entitlementSlug,
  });
}
