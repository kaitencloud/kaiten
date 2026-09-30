import { startOfMonth } from 'date-fns';
import type { DashboardCollections } from './dashboard-metrics.collections';
import {
  buildMonthlySeries,
  getChartFill,
  getDaysUntil,
  toDate,
} from './dashboard-metrics.helpers';

export function buildLicenseExpirationForecast(
  activeInstances: DashboardCollections['activeInstances'],
  now: Date,
) {
  const licenseExpirationForecast = [
    { bucket: '0-7d', count: 0, fill: 'var(--chart-5)' },
    { bucket: '8-30d', count: 0, fill: 'var(--chart-4)' },
    { bucket: '31-60d', count: 0, fill: 'var(--chart-3)' },
    { bucket: '61-90d', count: 0, fill: 'var(--chart-2)' },
    { bucket: '90+d', count: 0, fill: 'var(--chart-1)' },
  ];
  let expiringIn30Days = 0;
  let expiringIn60Days = 0;

  for (const instance of activeInstances) {
    const endDate = toDate(instance.endLicenseDate);

    if (!endDate) {
      continue;
    }

    const remainingDays = getDaysUntil(endDate, now);

    if (remainingDays < 0) {
      continue;
    }

    if (remainingDays <= 30) {
      expiringIn30Days += 1;
    }

    if (remainingDays <= 60) {
      expiringIn60Days += 1;
    }

    const bucketIndex =
      remainingDays <= 7
        ? 0
        : remainingDays <= 30
          ? 1
          : remainingDays <= 60
            ? 2
            : remainingDays <= 90
              ? 3
              : 4;

    licenseExpirationForecast[bucketIndex].count += 1;
  }

  return {
    expiringIn30Days,
    expiringIn60Days,
    licenseExpirationForecast,
  };
}

export function buildTopCustomersByInstances(
  activeInstances: DashboardCollections['activeInstances'],
  activeGraphQlInstances: DashboardCollections['activeGraphQlInstances'],
  customers: DashboardCollections['customers'],
  usesRestInstances: boolean,
) {
  const customerNameById = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );
  const customerInstancesMap = new Map<string, number>();
  const instancesForCustomers = usesRestInstances
    ? activeInstances
    : activeGraphQlInstances;

  for (const instance of instancesForCustomers) {
    customerInstancesMap.set(
      instance.customerId,
      (customerInstancesMap.get(instance.customerId) ?? 0) + 1,
    );
  }

  return Array.from(customerInstancesMap.entries())
    .map(([customerId, count], index) => ({
      customer: customerNameById.get(customerId) ?? customerId,
      fill: getChartFill(index),
      instances: count,
    }))
    .sort((a, b) => b.instances - a.instances)
    .slice(0, 8);
}

export function buildInstanceLifecycleTimeline(
  instancesForCustomers: DashboardCollections['activeInstances'],
) {
  const lifecycleRaw = new Map<
    number,
    { created: number; ending: number; started: number }
  >();
  const lifecycleDates: Array<Date | null> = [];

  for (const instance of instancesForCustomers) {
    const createdAt = toDate(instance.createdAt);
    const startAt = toDate(instance.startLicenseDate);
    const endAt = toDate(instance.endLicenseDate);

    lifecycleDates.push(createdAt, startAt, endAt);

    for (const [date, key] of [
      [createdAt, 'created'],
      [startAt, 'started'],
      [endAt, 'ending'],
    ] as const) {
      if (!date) {
        continue;
      }

      const timestamp = startOfMonth(date).getTime();
      const current = lifecycleRaw.get(timestamp) ?? {
        created: 0,
        ending: 0,
        started: 0,
      };

      current[key] += 1;
      lifecycleRaw.set(timestamp, current);
    }
  }

  return buildMonthlySeries(lifecycleDates, lifecycleRaw);
}
