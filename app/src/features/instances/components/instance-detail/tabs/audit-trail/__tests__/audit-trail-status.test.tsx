import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';
import type { AuditTrail } from '@/api-client/types.gen';
import type { InstanceEntitlementRow } from '../../../../../utils/instance-detail-entitlements.utils';
import { AuditTrailStatsCards } from '../audit-trail-stats-cards';
import {
  buildActivityTimelineGroupData,
  buildActivityTimelineStatusData,
  filterAuditTrailEntries,
} from '../audit-trail.utils';

// The status of an event is the audit trail domain's (`getEventCategory`), so
// the three usage events that say a limit is approaching, at or past are
// warnings here as they are in the global feed. The domain pins the list of
// events; these tests pin what this tab does with the `warning` status.

vi.mock('react-i18next', () => ({
  initReactI18next: {
    init: () => undefined,
    type: '3rdParty',
  },
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string) => key,
  }),
}));

const WARNING_EVENTS = [
  'INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED',
  'INSTANCE_ENTITLEMENT_USAGE_REACHED',
  'INSTANCE_ENTITLEMENT_CAP_EXCEEDED',
];

const entry = (
  id: string,
  eventName: string,
  timestamp = '2026-03-24T10:00:00.000Z',
): AuditTrail => ({
  eventName,
  eventType: `com.kaiten.test.${eventName.toLowerCase()}`,
  id,
  instanceId: 'instance-1',
  instanceSlug: 'acme-prod',
  payload: { entitlement_slug: 'api-calls' },
  timestamp,
});

const entries: AuditTrail[] = [
  entry('1', 'ENTITLEMENT_VALUE_GET'),
  entry('2', 'ENTITLEMENT_USAGE_REPORT_ACCEPTED'),
  entry('3', 'ENTITLEMENT_USAGE_REPORT_REJECTED'),
  ...WARNING_EVENTS.map((eventName, index) =>
    entry(String(4 + index), eventName, '2026-03-25T10:00:00.000Z'),
  ),
];

const entitlementsRows: InstanceEntitlementRow[] = [
  {
    enabled: true,
    entitlementId: 'ent-api',
    entitlementGroups: [{ id: 'group-usage', name: 'Usage', slug: 'usage' }],
    entitlementName: 'API Calls',
    entitlementSlug: 'api-calls',
    entitlementType: 'NUMBER',
    threshold: 100,
    limitCapExceededOveragePercent: 0,
    value: 0,
  },
];

const filterByStatus = (statusFilter: string) =>
  filterAuditTrailEntries(
    entries,
    { eventFilter: 'all', groupFilter: 'all', searchQuery: '', statusFilter },
    (eventName) => eventName,
    entitlementsRows,
  ).map((item) => item.eventName);

describe('audit trail status in the instance tab', () => {
  it('keeps the three usage events under the Warning status and nowhere else', () => {
    expect(filterByStatus('warning')).toEqual(WARNING_EVENTS);
    expect(filterByStatus('read')).toEqual(['ENTITLEMENT_VALUE_GET']);
    expect(filterByStatus('accepted')).toEqual([
      'ENTITLEMENT_USAGE_REPORT_ACCEPTED',
    ]);
    expect(filterByStatus('rejected')).toEqual([
      'ENTITLEMENT_USAGE_REPORT_REJECTED',
    ]);
  });

  it('finds a warning by typing its status in the search box', () => {
    const found = filterAuditTrailEntries(
      entries,
      {
        eventFilter: 'all',
        groupFilter: 'all',
        searchQuery: 'warning',
        statusFilter: 'all',
      },
      (eventName) => eventName,
      entitlementsRows,
    );

    expect(found.map((item) => item.eventName)).toEqual(WARNING_EVENTS);
  });

  it('counts the warnings of a day in the status timeline', () => {
    const timelineData = buildActivityTimelineStatusData({
      entries,
      entitlementsRows,
      groupFilter: 'all',
      entitlementFilter: 'all',
      locale: 'en-US',
    });

    expect(timelineData).toHaveLength(2);
    expect(timelineData[0]).toMatchObject({
      accepted: 1,
      read: 1,
      rejected: 1,
      warning: 0,
    });
    expect(timelineData[1]).toMatchObject({
      accepted: 0,
      read: 0,
      rejected: 0,
      warning: 3,
    });
  });

  it('includes or leaves out the warnings in the group timeline, as the chips say', () => {
    const buildGroupData = (
      includedStatuses: Parameters<
        typeof buildActivityTimelineGroupData
      >[0]['includedStatuses'],
    ) =>
      buildActivityTimelineGroupData({
        entries,
        entitlementsRows,
        includedGroupSlugs: ['usage'],
        includedStatuses,
        locale: 'en-US',
      });

    expect(buildGroupData(['warning']).map((day) => day.usage)).toEqual([3]);
    expect(
      buildGroupData(['read', 'accepted', 'rejected']).map((day) => day.usage),
    ).toEqual([3]);
    expect(
      buildGroupData(['read', 'accepted', 'rejected', 'warning']).map(
        (day) => day.usage,
      ),
    ).toEqual([3, 3]);
  });

  it('counts the warnings on their own card, apart from the reads', () => {
    render(<AuditTrailStatsCards entries={entries} />);

    const valueOf = (labelKey: string) =>
      screen
        .getByText(`Pages.Customers.Instances.Detail.auditTrail.stats.${labelKey}`)
        .closest('[data-slot="stat-card"]')
        ?.querySelector('[data-slot="stat-card-value"]')?.textContent;

    expect(valueOf('warnings')).toBe('3');
    expect(valueOf('read')).toBe('1');
    expect(valueOf('accepted')).toBe('1');
    expect(valueOf('rejected')).toBe('1');
    expect(valueOf('totalEvents')).toBe('6');
  });
});
