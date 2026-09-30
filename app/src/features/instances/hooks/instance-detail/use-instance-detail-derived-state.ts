import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DeploymentZone,
  Entitlement,
  EntitlementUsage,
  Instance,
  LicenseEntitlement,
  Release,
} from '@/api-client';
import { getReleaseOverviewStatus } from '@/domains/release-management';
import type {
  ReleaseManagementOverviewRelease,
  ReleaseStatus,
} from '@/domains/release-management';
import { getAuditDisplayName } from '@/lib/detail';
import {
  getDaysUntil,
  getLicenseProgressPercent,
  getLicenseUrgencyVariant,
} from '../../utils/instance-detail.utils';
import {
  buildEntitlementsRows,
  getEntitlementsMetrics,
} from '../../utils/instance-detail-entitlements.utils';

type UseInstanceDetailDerivedStateParams = {
  instance: Instance;
  entitlements: Entitlement[];
  entitlementUsages: EntitlementUsage[];
  licenseEntitlements: LicenseEntitlement[];
  deploymentZones: DeploymentZone[];
  overviewReleases: ReleaseManagementOverviewRelease[];
  releases: Release[];
};

export const useInstanceDetailDerivedState = ({
  instance,
  entitlements,
  entitlementUsages,
  licenseEntitlements,
  deploymentZones,
  overviewReleases,
  releases,
}: UseInstanceDetailDerivedStateParams) => {
  const { t } = useTranslation();

  // Resolve release info via the actual data chain only:
  // instance.deploymentZoneId → zone → zone.releaseId → release. Free-form
  // metadata must never feed the release card: keys like "version" or
  // "cluster" would otherwise leak into it.
  const linkedZone = deploymentZones.find(
    (z) => z.id === instance.deploymentZoneId,
  );
  // By the zone's CURRENT releaseId, and nothing else. This used to match the
  // first overview release whose instances -- or deployment zones -- mentioned
  // this instance's zone, and both of those lists are history: they include
  // every release the zone ever ran. Once a zone moved from one release to the
  // next, the instance could show whichever older release happened to come
  // first.
  const overviewRelease = linkedZone?.releaseId
    ? overviewReleases.find(
        (candidate) => candidate.id === linkedZone.releaseId,
      )
    : undefined;
  const overviewZone = linkedZone
    ? overviewRelease?.deploymentZones.find(
        (candidateZone) =>
          candidateZone.id === linkedZone.id ||
          candidateZone.slug === linkedZone.slug,
      )
    : undefined;
  const linkedRelease = linkedZone?.releaseId
    ? releases.find((r) => r.id === linkedZone.releaseId)
    : undefined;

  const unknown = t('Pages.Customers.Instances.Detail.quickStats.unknown');
  const releaseVersion =
    overviewRelease?.version ?? linkedRelease?.version ?? unknown;
  // The overview holds the release's history, the same status as everywhere
  // else. A release it does not hold yet (created a moment ago) has only the
  // zone that runs it to go by: Deployed on a production zone, Staging on a
  // staging or development one.
  const releaseStatus: ReleaseStatus | null = overviewRelease
    ? getReleaseOverviewStatus(overviewRelease)
    : linkedRelease && linkedZone
      ? getReleaseOverviewStatus({
          deploymentZones: [linkedZone],
          id: linkedRelease.id,
        })
      : null;
  const deploymentZone = overviewZone?.name ?? linkedZone?.name ?? unknown;
  const deployedAt =
    (overviewZone?.updatedAt ? String(overviewZone.updatedAt) : null) ??
    (linkedZone?.updatedAt ? String(linkedZone.updatedAt) : null);
  const deployedByName = getAuditDisplayName({
    // Only the zone carries an updatedBy: a release is immutable, so it has
    // no "last updated by" to fall back on.
    actor: linkedZone?.updatedBy,
  });

  const createdByName = getAuditDisplayName({
    actor: instance.createdBy,
  });
  const updatedByName = getAuditDisplayName({
    actor: instance.updatedBy,
  });

  const entitlementsRows = useMemo(
    () =>
      buildEntitlementsRows(
        licenseEntitlements,
        entitlementUsages,
        t('Pages.Customers.Instances.Detail.entitlements.unknownEntitlement'),
        entitlements,
      ),
    [entitlements, entitlementUsages, licenseEntitlements, t],
  );
  const entitlementsMetrics = useMemo(
    () => getEntitlementsMetrics(entitlementsRows, 25),
    [entitlementsRows],
  );

  const daysLeft = getDaysUntil(instance.endLicenseDate);
  const licenseUrgency = getLicenseUrgencyVariant(daysLeft);

  return {
    entitlementsRows,
    entitlementsMetrics,
    releaseVersion,
    releaseStatus,
    releaseSlug: overviewRelease?.slug ?? linkedRelease?.slug ?? null,
    deploymentZone,
    zoneSlug: overviewZone?.slug ?? linkedZone?.slug ?? null,
    deployedAt,
    deployedByName,
    createdByName,
    updatedByName,
    daysLeft,
    licenseProgress: getLicenseProgressPercent(
      instance.startLicenseDate,
      instance.endLicenseDate,
    ),
    urgencyTextClassName:
      licenseUrgency === 'destructive'
        ? 'text-destructive-subtle-foreground'
        : licenseUrgency === 'secondary'
          ? 'text-warning-subtle-foreground'
          : 'text-success-subtle-foreground',
  };
};
