import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import {
  describeEffectiveChange,
  formatEffectiveValue,
} from '../instance-addon-effects.utils';

// The texts of the keys the lines read, as the English locale writes them.
const TEXTS: Record<string, string> = {
  'Pages.Customers.Instances.Detail.Billing.Addons.Effect.configured': 'Configured',
  'Pages.Customers.Instances.Detail.Billing.Addons.Effect.none': 'Not granted',
  'Pages.Customers.Instances.Detail.entitlements.status.disabled': 'Disabled',
  'Pages.Customers.Instances.Detail.entitlements.status.enabled': 'Enabled',
  'Pages.Customers.Instances.Detail.entitlements.unlimited': 'Unlimited',
};
const t = ((key: string, options?: Record<string, string>) =>
  key === 'Pages.Customers.Instances.Detail.Billing.Addons.Effect.change'
    ? `${options?.entitlement}: ${options?.before} → ${options?.after}`
    : (TEXTS[key] ?? key)) as unknown as TFunction;

describe('an effective value', () => {
  it('is read as a number, unlimited, a flag, a configuration or nothing', () => {
    expect(formatEffectiveValue({ type: 'number', value: 12_500 }, t)).toBe('12,500');
    expect(formatEffectiveValue({ type: 'number', value: -1 }, t)).toBe('Unlimited');
    expect(formatEffectiveValue({ type: 'boolean', value: true }, t)).toBe('Enabled');
    expect(formatEffectiveValue({ type: 'boolean', value: false }, t)).toBe('Disabled');
    expect(formatEffectiveValue({ type: 'object', value: {} }, t)).toBe('Configured');
    expect(formatEffectiveValue(undefined, t)).toBe('Not granted');
  });
});

describe('a change of effective value', () => {
  const seats = { name: 'Seats', slug: 'seats' };

  it('names the entitlement and gives both values', () => {
    expect(
      describeEffectiveChange(
        {
          after: { type: 'number', value: 20 },
          before: { type: 'number', value: 10 },
          entitlementSlug: 'seats',
        },
        [seats],
        t,
      ),
    ).toBe('Seats: 10 → 20');
  });

  it('falls back to the slug of an entitlement the catalogue does not know', () => {
    expect(
      describeEffectiveChange(
        {
          after: { type: 'boolean', value: true },
          before: undefined,
          entitlementSlug: 'priority-support',
        },
        [seats],
        t,
      ),
    ).toBe('priority-support: Not granted → Enabled');
  });
});
