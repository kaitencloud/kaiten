import type { AuditTrail } from '@/api-client/types.gen';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';
import { ActivityTimelineCard } from './activity-timeline-card';
import { ValueOverTimeCard } from './value-over-time-card';

export const AuditTrailChartsSection = ({
  entitlementsRows,
  entries,
  locale,
}: {
  entitlementsRows: InstanceEntitlementRow[];
  entries: AuditTrail[];
  locale: string;
}) => {
  return (
    <>
      <ActivityTimelineCard
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale={locale}
      />
      <ValueOverTimeCard
        entitlementsRows={entitlementsRows}
        entries={entries}
        locale={locale}
      />
    </>
  );
};
