import { exportOrganizationUsageReports } from '@/api-client';
import { handleBillingProblem } from '@/domains/billing';
import { downloadBlob } from '@/lib/download-blob';
import { type UsageChunk, usageChunkFilename } from '../utils/usage-chunks';

/**
 * Saves the usage reports of every instance for one month as a CSV. The export is
 * a stream behind the bearer token of the session, so the request is the client's
 * and the browser is handed the blob; a refusal is thrown as the SDK throws it, for
 * the caller to show.
 *
 * The oldest month a deployment lists begins before the usage it keeps does, since
 * the retention is told in months and not to the day. The API then refuses with
 * where the kept usage begins, and the month is read from there: asking again once
 * is what a person would do, and what leaves them with the part of the month that
 * exists. A month that ends before that has nothing to read, and the refusal says so.
 */
export async function downloadUsageChunk(
  chunk: UsageChunk,
  now?: Date,
): Promise<void> {
  const save = (from: string) =>
    downloadBlob(
      () =>
        exportOrganizationUsageReports({
          parseAs: 'blob',
          query: { format: 'csv', from, to: chunk.to },
          throwOnError: true,
        }),
      usageChunkFilename(chunk, now),
    );

  try {
    await save(chunk.from);
  } catch (error) {
    const problem = handleBillingProblem(error);
    const { retentionStart } = problem;
    if (
      problem.kind === 'outside-retention' &&
      retentionStart !== undefined &&
      Date.parse(retentionStart) < Date.parse(chunk.to)
    ) {
      await save(retentionStart);

      return;
    }
    throw error;
  }
}
