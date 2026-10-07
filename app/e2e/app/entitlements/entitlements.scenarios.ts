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
      'api-calls': { licenseGrants: 2, licensePrices: 1, usageCounters: 3 },
      seats: { usageCounters: 1 },
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
    references: { seats: { usageCounters: 1 } },
  });
}
