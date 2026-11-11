import type {
  Customer,
  DashboardInstanceReports,
  DashboardLicenseEnding,
  DashboardMeter,
  DashboardSummary,
  DashboardZone,
  DeploymentZone,
  Entitlement,
  EntitlementUsage,
  Instance,
  InstanceBilling,
  Invoice,
  License,
  UsageReport,
} from '@/api-client';
import type { BillingPublishableKeysSeed } from '../../../../e2e/app/_support/model/billing-publishable-keys';
import type {
  ReleaseManagementDeploymentRecord,
  ReleaseManagementReleaseRecord,
} from '../../../../e2e/app/_support/model/release-management-app-model';
import { daysAgo, minutesAgo } from './dates';
import type { FeatureFlagRecord } from './feature-flags';

const DAYS = 30;
const DAY_MS = 86_400_000;

type DashboardWorld = {
  customers: Customer[];
  deploymentZones: DeploymentZone[];
  deployments: ReleaseManagementDeploymentRecord[];
  entitlementUsagesByInstance: Record<string, EntitlementUsage[]>;
  entitlements: Entitlement[];
  featureFlags: FeatureFlagRecord[];
  instances: Instance[];
  licenses: License[];
  releases: ReleaseManagementReleaseRecord[];
};

type DashboardExtras = {
  invoices: Invoice[];
  publishableKeys: BillingPublishableKeysSeed;
  stripeConnected: boolean;
  subscriptions: InstanceBilling[];
  usageReports: Record<string, Record<string, UsageReport[]>>;
};

const within = (iso: string | undefined, days: number, now: number) => {
  if (iso === undefined) {
    return false;
  }
  const at = Date.parse(iso);
  return at <= now && now - at <= days * DAY_MS;
};

const hash = (text: string) => {
  let sum = 7;
  for (let index = 0; index < text.length; index += 1) {
    sum = (sum * 31 + text.charCodeAt(index)) % 100_003;
  }
  return sum;
};

/**
 * The dashboard over the same records as the rest of the world, the way the API
 * computes it: every instance in the fleet, its meters measured against the grants
 * of its license, the licenses ending, the zones behind the newest release, the
 * subscriptions and the invoices of the month. What the world does not journal
 * (the reports each instance sent, the evaluations of each flag) is counted from
 * what it has, the same way on every start.
 */
export function createDashboardSummary(
  world: DashboardWorld,
  extras: DashboardExtras,
): DashboardSummary {
  const now = Date.now();
  const customerById = new Map(world.customers.map((c) => [c.id, c]));
  const licenseBySlug = new Map(
    world.licenses.map((license) => [license.slug ?? license.id, license]),
  );
  const entitlementBySlug = new Map(
    world.entitlements.map((e) => [e.slug ?? e.id, e]),
  );
  const subscriptionBySlug = new Map(
    extras.subscriptions.map((s) => [s.instanceSlug, s]),
  );

  const metersOf = (instance: Instance): DashboardMeter[] => {
    const slug = instance.slug ?? instance.id;
    const customer = customerById.get(instance.customerId);
    const license = licenseBySlug.get(instance.licenseSlug);
    return (world.entitlementUsagesByInstance[slug] ?? []).flatMap((usage) => {
      if (usage.value.type !== 'number' || usage.limit?.type !== 'number') {
        return [];
      }
      const entitlement = entitlementBySlug.get(usage.entitlementSlug);
      const used = usage.value.value;
      const granted = usage.limit.value < 0 ? null : usage.limit.value;
      const allowance = usage.limitCapExceededOveragePercent ?? 0;
      const maxAllowed =
        granted === null || allowance < 0
          ? null
          : allowance === 0
            ? granted
            : granted * (1 + allowance / 100);
      const reference = maxAllowed ?? granted;
      const ratio =
        reference !== null && reference > 0 ? used / reference : null;
      const warning = entitlement?.warningThresholdPercent ?? 80;
      const limitReached = maxAllowed !== null && used >= maxAllowed;
      return [
        {
          aboveWarning:
            !limitReached && ratio !== null && ratio * 100 >= warning,
          allowancePercent: allowance,
          customerName: customer?.name ?? instance.customerSlug,
          customerSlug: instance.customerSlug,
          entitlementName: entitlement?.name ?? usage.entitlementSlug,
          entitlementSlug: usage.entitlementSlug,
          granted,
          hardLimit: allowance === 0 && granted !== null,
          instanceName: instance.name,
          instanceSlug: slug,
          licenseName: license?.name ?? instance.licenseSlug,
          licenseState: license?.lifecycleState ?? 'PUBLISHED',
          limitReached,
          maxAllowed,
          ratio,
          unit: entitlement?.unitPlural ?? entitlement?.unitSingular ?? null,
          used,
          warningThresholdPercent: warning,
          windowStart: usage.currentPeriodStart ?? null,
        },
      ];
    });
  };

  const meters = world.instances.flatMap(metersOf);
  const byRatio = (left: DashboardMeter, right: DashboardMeter) =>
    (right.ratio ?? -1) - (left.ratio ?? -1);
  const limitReached = meters.filter((m) => m.limitReached).sort(byRatio);
  const nearThreshold = meters.filter((m) => m.aboveWarning).sort(byRatio);
  const atHardLimit = new Set(
    limitReached.filter((m) => m.hardLimit).map((m) => m.instanceSlug),
  );

  // An instance that waits for a zone has nothing running, so nothing reports.
  // The journals the world keeps are counted; the other instances report each
  // meter once a day. A report over a hard limit is refused.
  const byInstance: DashboardInstanceReports[] = world.instances.map(
    (instance, index) => {
      const slug = instance.slug ?? instance.id;
      const license = licenseBySlug.get(instance.licenseSlug);
      const silent = !instance.deploymentZoneId;
      const journal = Object.values(extras.usageReports[slug] ?? {})
        .flat()
        .filter((report) => within(report.reportedAt, DAYS, now)).length;
      const meterCount = metersOf(instance).length;
      const refused = atHardLimit.has(slug);
      return {
        accepted: silent ? 0 : journal || meterCount * DAYS,
        customerName:
          customerById.get(instance.customerId)?.name ?? instance.customerSlug,
        customerSlug: instance.customerSlug,
        instanceName: instance.name,
        instanceSlug: slug,
        lastReadAt: silent ? null : minutesAgo(5 + index * 20),
        lastReportAt: silent ? null : minutesAgo(15 + index * 50),
        licenseName: license?.name ?? instance.licenseSlug,
        licenseState: license?.lifecycleState ?? 'PUBLISHED',
        rejected: refused ? 9 : 0,
        rejected24h: refused ? 3 : 0,
        silent,
        standing: 'healthy' as const,
      };
    },
  );
  // The standing of each instance, as the API decides it over every meter of
  // the instance: a meter at its limit before one above its threshold, the
  // higher ratio first; silent when nothing reported or read.
  const meterState = (m: DashboardMeter) =>
    m.limitReached ? 2 : m.aboveWarning ? 1 : 0;
  for (const row of byInstance) {
    const headline = meters
      .filter((m) => m.instanceSlug === row.instanceSlug)
      .sort(
        (a, b) =>
          meterState(b) - meterState(a) || (b.ratio ?? -1) - (a.ratio ?? -1),
      )[0];
    row.headline = headline;
    row.standing = headline?.limitReached
      ? 'atLimit'
      : headline?.aboveWarning
        ? 'watch'
        : row.silent
          ? 'silent'
          : 'healthy';
  }
  const byStanding = { atLimit: 0, watch: 0, silent: 0, healthy: 0 };
  for (const row of byInstance) {
    byStanding[row.standing] += 1;
  }

  const accepted = byInstance.reduce((sum, row) => sum + row.accepted, 0);
  const rejected = byInstance.reduce((sum, row) => sum + row.rejected, 0);
  const rejected24h = byInstance.reduce((sum, row) => sum + row.rejected24h, 0);

  // One bar a day, busier on some days than others, the total exact.
  const wobble = [2, -1, -1, 3, -2, -1, 0];
  const base = Math.floor(accepted / DAYS);
  const perDay = Array.from({ length: DAYS }, (_, index) => {
    const day = new Date(now - (DAYS - 1 - index) * DAY_MS);
    day.setUTCHours(0, 0, 0, 0);
    return {
      accepted: Math.max(0, base + (wobble[index % wobble.length] ?? 0)),
      day: day.toISOString(),
      rejected:
        index === DAYS - 1
          ? rejected24h
          : index === DAYS - 2
            ? rejected - rejected24h
            : 0,
    };
  });
  const last = perDay[DAYS - 1];
  if (last) {
    last.accepted += accepted - perDay.reduce((sum, d) => sum + d.accepted, 0);
  }

  const instanceOf = (row: DashboardInstanceReports, status?: string) => ({
    customerName: row.customerName,
    customerSlug: row.customerSlug,
    instanceName: row.instanceName,
    instanceSlug: row.instanceSlug,
    lastActivityAt: row.lastReportAt,
    ...(status === undefined ? {} : { status }),
  });
  const notHealthy = world.instances.flatMap((instance) => {
    const row = byInstance.find(
      (r) => r.instanceSlug === (instance.slug ?? instance.id),
    );
    return instance.status && instance.status !== 'HEALTHY' && row
      ? [instanceOf(row, instance.status)]
      : [];
  });

  // The licenses: who runs which version, who ends soon, who is on a version
  // nobody should still be on.
  const familyOf = (license: License) =>
    (license.familyId ?? license.slug ?? license.id).replace(/^family-/, '');
  const instancesOn = (license: License) =>
    world.instances.filter((i) => i.licenseId === license.id).length;
  const families = [...new Set(world.licenses.map(familyOf))];
  const mix = families
    .map((familySlug) => {
      const versions = world.licenses
        .filter((license) => familyOf(license) === familySlug)
        .map((license) => ({
          instances: instancesOn(license),
          isDefault: license.isDefault,
          lifecycleState: license.lifecycleState ?? ('PUBLISHED' as const),
          name: license.name,
          slug: license.slug ?? license.id,
          version: Number(license.version) || 1,
        }));
      return {
        familySlug,
        instances: versions.reduce((sum, v) => sum + v.instances, 0),
        versions,
      };
    })
    .sort((left, right) => right.instances - left.instances);
  const ending: DashboardLicenseEnding[] = world.instances
    .filter((instance) => {
      const endsAt = Date.parse(instance.endLicenseDate);
      return endsAt >= now && endsAt - now <= 180 * DAY_MS;
    })
    .sort(
      (left, right) =>
        Date.parse(left.endLicenseDate) - Date.parse(right.endLicenseDate),
    )
    .map((instance) => ({
      billingStatus:
        subscriptionBySlug.get(instance.slug ?? instance.id)?.status ?? null,
      cancelAtPeriodEnd:
        subscriptionBySlug.get(instance.slug ?? instance.id)
          ?.cancelAtPeriodEnd ?? false,
      customerName:
        customerById.get(instance.customerId)?.name ?? instance.customerSlug,
      customerSlug: instance.customerSlug,
      endsAt: instance.endLicenseDate,
      instanceName: instance.name,
      instanceSlug: instance.slug ?? instance.id,
      licenseName:
        licenseBySlug.get(instance.licenseSlug)?.name ?? instance.licenseSlug,
    }));
  const within30 = ending.filter(
    (item) => Date.parse(item.endsAt) - now <= 30 * DAY_MS,
  );
  const archived = world.instances.flatMap((instance) => {
    const license = licenseBySlug.get(instance.licenseSlug);
    if (license?.lifecycleState !== 'ARCHIVED') {
      return [];
    }
    const familySlug = familyOf(license);
    return [
      {
        customerName:
          customerById.get(instance.customerId)?.name ?? instance.customerSlug,
        customerSlug: instance.customerSlug,
        defaultLicenseName:
          world.licenses.find((l) => familyOf(l) === familySlug && l.isDefault)
            ?.name ?? null,
        familySlug,
        instanceName: instance.name,
        instanceSlug: instance.slug ?? instance.id,
        licenseName: license.name,
        version: Number(license.version) || 1,
      },
    ];
  });

  // The zones, each against the newest release there is.
  const newestFirst = [...world.releases].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );
  const zones: DashboardZone[] = world.deploymentZones.map((zone) => {
    const release = newestFirst.find((r) => r.id === zone.releaseId);
    const deployed = world.deployments
      .filter((d) => d.deploymentZoneId === zone.id)
      .at(-1);
    return {
      deployedAt: deployed?.createdAt ?? null,
      deployedBy: release ? 'E2E Tester' : null,
      instances: world.instances.filter((i) => i.deploymentZoneId === zone.id)
        .length,
      name: zone.name,
      releaseVersion: release?.version ?? null,
      releasesBehind: release ? newestFirst.indexOf(release) : 0,
      slug: zone.slug ?? zone.id,
      type: zone.type,
    };
  });

  // Flags: the ones switched on are evaluated, except one switched on this week
  // that nothing calls yet.
  const perFlag = world.featureFlags.map((flag) => ({
    enabled: flag.enabled,
    evaluations:
      flag.enabled && !within(flag.createdAt, 7, now)
        ? 500 + (hash(flag.slug ?? flag.id) % 20_000)
        : 0,
    name: flag.name,
    slug: flag.slug ?? flag.id,
  }));

  const activeKeys = (extras.publishableKeys.keys ?? []).filter(
    (key) => !key.revokedAt,
  );
  const lastUsed = activeKeys
    .map((key) => key.lastUsedAt)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1);

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const invoicedThisMonth = Object.values(
    extras.invoices
      .filter(
        (invoice) =>
          invoice.issuedAt !== null &&
          Date.parse(invoice.issuedAt) >= monthStart.getTime(),
      )
      .reduce<
        Record<
          string,
          DashboardSummary['billing'] extends infer B
            ? B extends { invoicedThisMonth: Array<infer C> }
              ? C
              : never
            : never
        >
      >((byCurrency, invoice) => {
        const entry = (byCurrency[invoice.currency] ??= {
          currency: invoice.currency,
          invoices: 0,
          overdue: 0,
          paid: 0,
          totalMinor: 0,
        });
        entry.invoices += 1;
        entry.totalMinor += invoice.total;
        entry.paid += invoice.status === 'PAID' ? 1 : 0;
        entry.overdue +=
          invoice.dueAt !== null &&
          Date.parse(invoice.dueAt) < now &&
          !['PAID', 'VOID', 'UNCOLLECTIBLE', 'DRAFT'].includes(invoice.status)
            ? 1
            : 0;
        return byCurrency;
      }, {}),
  );
  const countStatus = (status: InstanceBilling['status']) =>
    extras.subscriptions.filter((s) => s.status === status).length;

  const silentRows = byInstance.filter((row) => row.silent);
  const behind = zones.filter((zone) => zone.releasesBehind > 0);

  return {
    asOf: new Date(now).toISOString(),
    attention: {
      archivedVersions: { count: archived.length, items: archived },
      checked: [
        'instancesNotHealthy',
        'limitsReached',
        'nearThreshold',
        'rejectedReports24h',
        'silentInstances',
        'licensesEnding30d',
        'archivedVersions',
        'zonesBehind',
        'tokensExpiring30d',
      ],
      limitsReached: { count: limitReached.length, items: limitReached },
      instancesNotHealthy: { count: notHealthy.length, items: notHealthy },
      licensesEnding30d: { count: within30.length, items: within30 },
      nearThreshold: { count: nearThreshold.length, items: nearThreshold },
      rejectedReports24h: {
        count: rejected24h,
        items: byInstance.filter((row) => row.rejected24h > 0),
      },
      silentInstances: {
        count: silentRows.length,
        items: silentRows.map((row) => instanceOf(row)),
      },
      tokensExpiring30d: { count: 0, items: [] },
      zonesBehind: { count: behind.length, items: behind },
    },
    billing: {
      invoicedThisMonth,
      subscriptions: {
        active: countStatus('ACTIVE'),
        canceled: countStatus('CANCELED'),
        pastDue: countStatus('PAST_DUE'),
        trial: countStatus('TRIAL'),
      },
    },
    featureFlags: {
      enabled: perFlag.filter((flag) => flag.enabled).length,
      evaluations: perFlag.reduce((sum, flag) => sum + flag.evaluations, 0),
      notEvaluated: perFlag.filter(
        (flag) => flag.enabled && flag.evaluations === 0,
      ).length,
      perFlag: [...perFlag].sort(
        (left, right) => right.evaluations - left.evaluations,
      ),
      total: perFlag.length,
    },
    figures: {
      customers: {
        createdInRange: world.customers.filter((c) =>
          within(c.createdAt, DAYS, now),
        ).length,
        total: world.customers.length,
      },
      instances: {
        activeInRange: byInstance.length - silentRows.length,
        byStatus: {
          DEGRADED: world.instances.filter((i) => i.status === 'DEGRADED')
            .length,
          HEALTHY: world.instances.filter(
            (i) => (i.status ?? 'HEALTHY') === 'HEALTHY',
          ).length,
          INCIDENT: world.instances.filter((i) => i.status === 'INCIDENT')
            .length,
          MAINTENANCE: world.instances.filter((i) => i.status === 'MAINTENANCE')
            .length,
        },
        createdInRange: world.instances.filter((i) =>
          within(i.createdAt, DAYS, now),
        ).length,
        byStanding,
        silentInRange: silentRows.length,
        total: world.instances.length,
      },
      usageReports: { accepted, rejected, rejected24h },
    },
    integrations: {
      connectors: {
        items: [
          {
            activated: extras.stripeConnected,
            activatedAt: extras.stripeConnected ? daysAgo(20) : null,
            name: 'stripe',
          },
          { activated: true, activatedAt: daysAgo(60), name: 'attio' },
        ],
      },
      publishableKeys: {
        count: activeKeys.length,
        lastUsedAt: lastUsed ?? null,
      },
      tokens: {
        activeTokens: 0,
        serviceAccounts: 0,
        tokensExpiring: [],
        tokensExpiring30Days: 0,
        tokensWithoutExpiry: 0,
      },
    },
    licenses: {
      archived,
      ending: {
        items: ending,
        within30Days: within30.length,
        within180Days: ending.length,
      },
      mix,
    },
    range: {
      auditTrailDays: DAYS,
      auditTrailFrom: perDay[0].day,
      days: DAYS,
      from: daysAgo(DAYS),
      range: '30d',
      to: new Date(now).toISOString(),
      usageHistoryDays: DAYS,
      usageHistoryFrom: perDay[0].day,
    },
    saturation: [...meters].sort(byRatio).slice(0, 8),
    usageReports: { byInstance, perDay },
    zones,
  };
}
