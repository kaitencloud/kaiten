import { hasActiveAuditFilters } from '../audit-trail.utils';
import type { AuditTrailFiltersState } from '../use-audit-trail-filters';
import { AuditTrailFeed } from './audit-trail-feed';
import { AuditTrailToolbar } from './audit-trail-toolbar';

export function AuditTrailList({
  state,
  total,
}: {
  state: AuditTrailFiltersState;
  total: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <AuditTrailToolbar
        filters={state.filters}
        onChange={state.updateFilters}
        eventTypeOptions={state.eventTypeOptions}
        instanceOptions={state.instanceOptions}
        customerOptions={state.customerOptions}
        shown={state.filteredEntries.length}
        total={total}
        hasActiveFilters={hasActiveAuditFilters(state.filters)}
        onReset={state.resetFilters}
      />
      <div className="min-h-0 flex-1">
        <AuditTrailFeed entries={state.filteredEntries} />
      </div>
    </div>
  );
}
