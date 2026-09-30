import Papa from 'papaparse';
import type { GlobalAuditEntry } from './audit-trail.types';
import { getEventCategory } from './audit-trail.utils';

const toCsvRow = (
  entry: GlobalAuditEntry,
  getEventLabel: (eventName: string) => string,
) => ({
  id: entry.id,
  event: getEventLabel(entry.eventName),
  event_name: entry.eventName,
  event_type: entry.eventType,
  instance: entry.instanceName ?? '',
  instance_slug: entry.instanceSlug ?? '',
  customer: entry.customerName ?? '',
  status: getEventCategory(entry.eventName),
  timestamp: entry.timestamp,
  payload: entry.payload == null ? '' : JSON.stringify(entry.payload),
});

export const buildAuditTrailCsv = (
  entries: GlobalAuditEntry[],
  getEventLabel: (eventName: string) => string,
): string =>
  Papa.unparse(entries.map((entry) => toCsvRow(entry, getEventLabel)));

// Builds the CSV for the given (already filtered) entries and triggers a
// client-side download. `dateStamp` is injected so the caller owns time access.
export const downloadAuditTrailCsv = (
  entries: GlobalAuditEntry[],
  getEventLabel: (eventName: string) => string,
  dateStamp: string,
): void => {
  const csv = buildAuditTrailCsv(entries, getEventLabel);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `audit-trail-${dateStamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
