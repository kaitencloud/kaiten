import { startOfMonth } from 'date-fns';
import type { DashboardCollections } from './dashboard-metrics.collections';
import {
  buildMonthlySeries,
  CHART_COLORS,
  getChartFill,
  toDate,
} from './dashboard-metrics.helpers';

export function buildReleaseMetrics(
  releases: DashboardCollections['releases'],
  zones: DashboardCollections['zones'],
) {
  const releaseTimelineRaw = new Map<
    number,
    { created: number; ending: number; started: number }
  >();
  const releaseDates: Array<Date | null> = [];
  const releaseVersionById = new Map(
    releases.map((release) => [release.id, release.version]),
  );
  const coverageMap = new Map<string, number>();
  let unassignedZones = 0;

  for (const release of releases) {
    const createdAt = toDate(release.createdAt);
    releaseDates.push(createdAt);

    if (!createdAt) {
      continue;
    }

    const key = startOfMonth(createdAt).getTime();
    const current = releaseTimelineRaw.get(key) ?? {
      created: 0,
      ending: 0,
      started: 0,
    };

    current.created += 1;
    releaseTimelineRaw.set(key, current);
  }

  for (const zone of zones) {
    if (!zone.releaseId) {
      unassignedZones += 1;
      continue;
    }

    coverageMap.set(zone.releaseId, (coverageMap.get(zone.releaseId) ?? 0) + 1);
  }

  const releaseCadence = buildMonthlySeries(
    releaseDates,
    releaseTimelineRaw,
  ).map((entry) => ({
    releases: entry.created,
    timestamp: entry.timestamp,
  }));
  const releaseCoverageByZone = Array.from(coverageMap.entries())
    .map(([releaseId, zonesCount], index) => ({
      fill: getChartFill(index),
      release: releaseVersionById.get(releaseId) ?? releaseId,
      zones: zonesCount,
    }))
    .sort((a, b) => b.zones - a.zones)
    .slice(0, 6);

  if (unassignedZones > 0) {
    releaseCoverageByZone.push({
      fill: CHART_COLORS[4],
      release: '__unassigned__',
      zones: unassignedZones,
    });
  }

  return { releaseCadence, releaseCoverageByZone };
}
