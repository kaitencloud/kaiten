import type { Entitlement } from '@/api-client';
import { EntitlementAppModel } from '../_support/model/entitlement-app-model';

const buildEntitlement = ({
  aggregationMethod = 'COUNT',
  createdAt = '2026-03-01T09:00:00.000Z',
  description = null,
  icon,
  id,
  name,
  slug,
  type = 'NUMBER',
  updatedAt = createdAt,
  unitSingular,
  unitPlural,
  saleUnitSingular,
  saleUnitPlural,
  saleUnitFactor,
  resetPeriod,
  resetAnchor,
  sources,
  usageSource,
  userFacing,
  warningThresholdPercent,
}: {
  aggregationMethod?: string;
  createdAt?: string;
  description?: string | null;
  icon?: string;
  id: string;
  name: string;
  slug: string;
  type?: string;
  updatedAt?: string;
  unitSingular?: string;
  unitPlural?: string;
  saleUnitSingular?: string;
  saleUnitPlural?: string;
  saleUnitFactor?: number;
  resetPeriod?: Entitlement['resetPeriod'];
  resetAnchor?: Entitlement['resetAnchor'];
  sources?: Entitlement['sources'];
  usageSource?: Entitlement['usageSource'];
  userFacing?: boolean;
  warningThresholdPercent?: number;
}): Entitlement => ({
  aggregationMethod: aggregationMethod as Entitlement['aggregationMethod'],
  createdAt,
  description,
  icon,
  id,
  name,
  slug,
  type: type as Entitlement['type'],
  updatedAt,
  unitSingular,
  unitPlural,
  saleUnitSingular,
  saleUnitPlural,
  saleUnitFactor,
  resetPeriod,
  resetAnchor,
  sources,
  usageSource,
  userFacing,
  warningThresholdPercent,
});

/** Empty model — for create tests */
export function createEmptyEntitlementsModel() {
  return new EntitlementAppModel();
}

/** Two entitlements — for list/read/delete tests */
export function createEntitlementsListModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        aggregationMethod: 'COUNT',
        description: 'Tracks the number of API calls per billing period',
        id: 'entitlement-api-calls',
        name: 'API Calls',
        slug: 'api-calls',
        type: 'NUMBER',
      }),
      buildEntitlement({
        description: 'Grants access to the advanced analytics dashboard',
        id: 'entitlement-advanced-analytics',
        name: 'Advanced Analytics',
        slug: 'advanced-analytics',
        type: 'BOOLEAN',
      }),
    ],
  });
}

/** Single deletable entitlement — for delete tests */
export function createDeletableEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'Grants access to priority support queues',
        id: 'entitlement-priority-support',
        name: 'Priority Support',
        slug: 'priority-support',
        type: 'BOOLEAN',
      }),
    ],
  });
}

/** Single NUMBER entitlement with a full unit configuration — for unit round-trip tests */
export function createUnitEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'Seats included in the customer plan',
        id: 'entitlement-seats',
        name: 'Seats',
        slug: 'seats',
        type: 'NUMBER',
        unitSingular: 'seat',
        unitPlural: 'seats',
        saleUnitSingular: 'pack',
        saleUnitPlural: 'packs',
        saleUnitFactor: 3,
      }),
    ],
  });
}

/** Single NUMBER entitlement with an early-warning threshold — for the edit round-trip of that threshold */
export function createThresholdEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'API calls included in the plan',
        id: 'entitlement-api-calls',
        name: 'API Calls',
        slug: 'api-calls',
        type: 'NUMBER',
        warningThresholdPercent: 80,
      }),
    ],
  });
}

/** Single entitlement with a stored icon — for icon round-trip tests */
export function createIconedEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'Grants access to priority support queues',
        icon: 'lucide:anchor',
        id: 'entitlement-priority-support',
        name: 'Priority Support',
        slug: 'priority-support',
        type: 'BOOLEAN',
      }),
    ],
  });
}

/**
 * Single NUMBER entitlement with a stored monthly window — for reset-period
 * round-trip tests. The cadence is a one-way door on the API, so every partial
 * edit (rename, icon, groups) has to echo the pair back untouched; this model
 * is what makes a path that forgets to fail.
 */
export function createPeriodicEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'API calls included in the customer plan',
        id: 'entitlement-api-calls',
        name: 'API Calls',
        slug: 'api-calls',
        type: 'NUMBER',
        aggregationMethod: 'SUM',
        resetPeriod: 'MONTH',
        resetAnchor: 'CALENDAR',
      }),
    ],
  });
}

/**
 * Two entitlements that cannot be deleted because something still references
 * them: the calls are granted by a license version, counted on instances and
 * metered by a price, and the seats are counted on instances. The one that
 * nothing references is the one that can.
 */
export function createReferencedEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'Tracks the number of API calls per billing period',
        id: 'entitlement-api-calls',
        name: 'API Calls',
        slug: 'api-calls',
        type: 'NUMBER',
      }),
      buildEntitlement({
        description: 'Counts the seats of an instance',
        id: 'entitlement-seats',
        name: 'Seats',
        slug: 'seats',
        type: 'NUMBER',
      }),
      buildEntitlement({
        description: 'Grants access to priority support queues',
        id: 'entitlement-priority-support',
        name: 'Priority Support',
        slug: 'priority-support',
        type: 'BOOLEAN',
      }),
    ],
    references: {
      'api-calls': { addonGrants: 3, licenseGrants: 2, licensePrices: 1 },
      seats: { addonGrants: 1 },
    },
  });
}

/**
 * The entitlement that is still referenced comes last in the list. A row leaves
 * the list at once when it is deleted and comes back when the API refuses, and the
 * last one is the row whose component is gone by then: the refusal has to be shown
 * by something that is not the row.
 */
export function createReferencedLastEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        description: 'Grants access to priority support queues',
        id: 'entitlement-priority-support',
        name: 'Priority Support',
        slug: 'priority-support',
        type: 'BOOLEAN',
      }),
      buildEntitlement({
        description: 'Counts the seats of an instance',
        id: 'entitlement-seats',
        name: 'Seats',
        slug: 'seats',
        type: 'NUMBER',
      }),
    ],
    references: { seats: { addonGrants: 1 } },
  });
}

/**
 * What a combined entitlement can sum, and what it cannot: two counters on one lifetime
 * window (the Nagare case, the credits of two services), two on a calendar month, a
 * counter that is averaged, one that is a flag. A source must be summed or counted, and
 * share its window with the others.
 */
const summableEntitlements = () => [
  buildEntitlement({
    aggregationMethod: 'SUM',
    description: 'Pages crawled by the scraping service',
    id: 'entitlement-firecrawl-credits',
    name: 'Firecrawl Credits',
    slug: 'firecrawl-credits',
    unitPlural: 'credits',
    unitSingular: 'credit',
  }),
  buildEntitlement({
    aggregationMethod: 'SUM',
    description: 'Tokens used by the language models',
    id: 'entitlement-ai-credits',
    name: 'AI Credits',
    slug: 'ai-credits',
    unitPlural: 'credits',
    unitSingular: 'credit',
  }),
  buildEntitlement({
    aggregationMethod: 'SUM',
    id: 'entitlement-monthly-requests',
    name: 'Monthly Requests',
    resetAnchor: 'CALENDAR',
    resetPeriod: 'MONTH',
    slug: 'monthly-requests',
  }),
  buildEntitlement({
    aggregationMethod: 'COUNT',
    id: 'entitlement-monthly-exports',
    name: 'Monthly Exports',
    resetAnchor: 'CALENDAR',
    resetPeriod: 'MONTH',
    slug: 'monthly-exports',
  }),
  buildEntitlement({
    aggregationMethod: 'AVERAGE',
    id: 'entitlement-average-latency',
    name: 'Average Latency',
    slug: 'average-latency',
  }),
  buildEntitlement({
    description: 'Grants access to the advanced analytics dashboard',
    id: 'entitlement-advanced-analytics',
    name: 'Advanced Analytics',
    slug: 'advanced-analytics',
    type: 'BOOLEAN',
  }),
];

/** Entitlements that can be summed, and none that sums them: for the creation of a combined one */
export function createCombinableEntitlementsModel() {
  return new EntitlementAppModel({ entitlements: summableEntitlements() });
}

/**
 * The same, with the combined entitlement a vendor shows its customers in place of the
 * two behind it: "Credits", weighted 0.4 on the Firecrawl credits and 0.6 on the AI
 * credits, and the only one that is user facing.
 */
export function createCombinedEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        aggregationMethod: 'SUM',
        description:
          'The credits a customer reads, whichever service spent them',
        id: 'entitlement-credits',
        name: 'Credits',
        slug: 'credits',
        sources: [
          { entitlementSlug: 'ai-credits', weight: '0.6' },
          { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
        ],
        unitPlural: 'credits',
        unitSingular: 'credit',
        usageSource: 'COMBINED_USAGE',
        userFacing: true,
      }),
      // A second one, over two other counters, one of which a license may leave unlimited.
      buildEntitlement({
        aggregationMethod: 'SUM',
        id: 'entitlement-capacity',
        name: 'Capacity',
        slug: 'capacity',
        sources: [
          { entitlementSlug: 'seats', weight: '2' },
          { entitlementSlug: 'storage-gb', weight: '1' },
        ],
        usageSource: 'COMBINED_USAGE',
      }),
      buildEntitlement({
        aggregationMethod: 'COUNT',
        id: 'entitlement-seats',
        name: 'Seats',
        slug: 'seats',
      }),
      buildEntitlement({
        aggregationMethod: 'SUM',
        id: 'entitlement-storage-gb',
        name: 'Storage GB',
        slug: 'storage-gb',
      }),
      ...summableEntitlements(),
    ],
  });
}

/**
 * A combined entitlement on a calendar month, to move to sources that count for life, and
 * a source that nothing combines: the window of a combined entitlement is the one its
 * sources share, and an edit may move them to another.
 */
export function createMonthlyCombinedEntitlementModel() {
  return new EntitlementAppModel({
    entitlements: [
      buildEntitlement({
        aggregationMethod: 'SUM',
        id: 'entitlement-throughput',
        name: 'Throughput',
        resetAnchor: 'CALENDAR',
        resetPeriod: 'MONTH',
        slug: 'throughput',
        sources: [
          { entitlementSlug: 'monthly-exports', weight: '1' },
          { entitlementSlug: 'monthly-requests', weight: '1' },
        ],
        usageSource: 'COMBINED_USAGE',
      }),
      ...summableEntitlements(),
    ],
  });
}
