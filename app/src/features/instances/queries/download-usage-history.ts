import { exportUsageReports } from '@/api-client';
import { downloadBlob } from '@/lib/download-blob';
import { formatFileStamp } from '@/lib/file-stamp';
import type { UsageHistoryRange } from './usage-history-query-options';

/**
 * The name of the CSV of the history of an entitlement on an instance:
 * `usage-globex-production-api-calls-20271004T153000Z.csv`. The API proposes one,
 * which a browser cannot read from the local stack (its CORS policy does not
 * expose `Content-Disposition`), so the console names the file: the instance and
 * the entitlement, and the UTC moment of the download, so that two exports never
 * overwrite each other.
 */
export function usageHistoryFilename(
  instanceSlug: string,
  entitlementSlug: string,
  now: Date = new Date(),
): string {
  return `usage-${instanceSlug}-${entitlementSlug}-${formatFileStamp(now)}.csv`;
}

/**
 * Saves the reports of the period as a CSV, every one of them and not only the
 * pages that were read. The export is a stream behind the bearer token of the
 * session, so the request is the client's and the browser is handed the blob; a
 * refusal (a period of more than 366 days, one before what is kept) is thrown as
 * the SDK throws it, for the caller to show. An open end is the API's default.
 */
export function downloadUsageHistory(
  instanceSlug: string,
  entitlementSlug: string,
  range: UsageHistoryRange,
  now?: Date,
): Promise<void> {
  return downloadBlob(
    () =>
      exportUsageReports({
        parseAs: 'blob',
        path: { entitlementSlug, instanceSlug },
        query: { ...range, format: 'csv' },
        throwOnError: true,
      }),
    usageHistoryFilename(instanceSlug, entitlementSlug, now),
  );
}
