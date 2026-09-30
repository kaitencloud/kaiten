import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveEventLabel } from './audit-trail-events';
import type {
  AuditFilters,
  AuditTrailOption,
  GlobalAuditEntry,
} from './audit-trail.types';
import {
  buildCustomerOptions,
  buildEventOptions,
  buildInstanceOptions,
  DEFAULT_AUDIT_FILTERS,
  filterAuditEntries,
} from './audit-trail.utils';

export interface AuditTrailFiltersState {
  filters: AuditFilters;
  updateFilters: (patch: Partial<AuditFilters>) => void;
  resetFilters: () => void;
  filteredEntries: GlobalAuditEntry[];
  eventTypeOptions: AuditTrailOption[];
  instanceOptions: AuditTrailOption[];
  customerOptions: AuditTrailOption[];
  getEventLabel: (eventName: string) => string;
}

// Owns the audit feed's filter state. Lifted out of the list so the page header
// (Export button) and the list both work off the same filtered result set.
export const useAuditTrailFilters = (
  entries: GlobalAuditEntry[],
): AuditTrailFiltersState => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<AuditFilters>(DEFAULT_AUDIT_FILTERS);

  const getEventLabel = useCallback(
    (eventName: string) => resolveEventLabel(eventName, t),
    [t],
  );

  const eventTypeOptions = useMemo(
    () => buildEventOptions(entries, getEventLabel),
    [entries, getEventLabel],
  );
  const instanceOptions = useMemo(
    () => buildInstanceOptions(entries),
    [entries],
  );
  const customerOptions = useMemo(
    () => buildCustomerOptions(entries),
    [entries],
  );
  const filteredEntries = useMemo(
    () => filterAuditEntries(entries, filters, getEventLabel),
    [entries, filters, getEventLabel],
  );

  const updateFilters = useCallback(
    (patch: Partial<AuditFilters>) =>
      setFilters((previous) => ({ ...previous, ...patch })),
    [],
  );
  const resetFilters = useCallback(() => setFilters(DEFAULT_AUDIT_FILTERS), []);

  return {
    filters,
    updateFilters,
    resetFilters,
    filteredEntries,
    eventTypeOptions,
    instanceOptions,
    customerOptions,
    getEventLabel,
  };
};
