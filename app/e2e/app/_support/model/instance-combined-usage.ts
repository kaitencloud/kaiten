import type { Entitlement, EntitlementUsage } from '@/api-client';
import {
  add,
  formatDecimal,
  multiply,
  parseDecimal,
  ZERO,
  type Decimal,
} from './decimal';

/**
 * The combined entitlements an instance reads, as the API appends them to its usage
 * (`api/internal/modules/instances/getentitlementsusagemetrics/combined.go`): one computed
 * row per combined entitlement with at least one source the instance is granted, which is
 * the weighted sum of those sources' usage over the weighted sum of their limits, each
 * exact, and unlimited as soon as one source is. A source that is not granted counts for
 * nothing. The row has the license as its source, no provenance and no reserved, the window
 * the sources share, and one `sources` detail per source it sums.
 */

const UNLIMITED = -1;

// A float as the exact decimal it is read as: 0.4 is 0.4, not 0.40000000000000002.
const exact = (value: number): Decimal =>
  parseDecimal(Number.isInteger(value) ? String(value) : value.toFixed(10));

const numberOf = (value: EntitlementUsage['value'] | undefined) =>
  value?.type === 'number' ? value : undefined;

export function withCombinedUsage(
  usages: EntitlementUsage[],
  catalogue: readonly Entitlement[],
): EntitlementUsage[] {
  const granted = new Map(
    usages.map((usage) => [usage.entitlementSlug, usage]),
  );
  const computed: EntitlementUsage[] = [];

  for (const definition of catalogue) {
    if (definition.usageSource !== 'COMBINED_USAGE') {
      continue;
    }
    const parts = (definition.sources ?? []).flatMap((source) => {
      const read = granted.get(source.entitlementSlug);
      const usage = numberOf(read?.value);
      const limit = numberOf(read?.limit);

      return read && usage && limit ? [{ limit, read, source, usage }] : [];
    });
    if (parts.length === 0) {
      continue;
    }

    let value = ZERO;
    let ceiling = ZERO;
    let unlimited = false;
    let events: number | undefined;
    let window: EntitlementUsage | undefined;
    for (const { limit, read, source, usage } of parts) {
      const weight = parseDecimal(source.weight ?? '1');
      value = add(value, multiply(weight, exact(usage.value)));
      if (limit.value === UNLIMITED) {
        unlimited = true;
      } else {
        ceiling = add(ceiling, multiply(weight, exact(limit.value)));
      }
      const count = (usage as { event_count?: number }).event_count;
      if (count !== undefined) {
        events = (events ?? 0) + count;
      }
      // The sources share one window: the one that started last is the one that is open.
      if (
        read.currentPeriodStart &&
        (!window?.currentPeriodStart ||
          read.currentPeriodStart > window.currentPeriodStart)
      ) {
        window = read;
      }
    }

    computed.push({
      currentPeriodEnd: window?.currentPeriodEnd,
      currentPeriodStart: window?.currentPeriodStart,
      entitlementId: definition.id,
      entitlementSlug: definition.slug ?? '',
      licenseId: parts[0].read.licenseId,
      licenseSlug: parts[0].read.licenseSlug,
      limit: {
        type: 'number',
        value: unlimited ? UNLIMITED : Number(formatDecimal(ceiling)),
      },
      limitCapExceededOveragePercent: unlimited ? UNLIMITED : 0,
      source: 'license',
      sources: parts.map(({ limit, source, usage }) => ({
        entitlementSlug: source.entitlementSlug,
        limit: limit.value,
        usage: usage.value,
        weight: formatDecimal(parseDecimal(source.weight ?? '1')),
      })),
      value: {
        type: 'number',
        value: Number(formatDecimal(value)),
        ...(events === undefined ? {} : { event_count: events }),
      },
    } as EntitlementUsage);
  }

  return [...usages, ...computed];
}
