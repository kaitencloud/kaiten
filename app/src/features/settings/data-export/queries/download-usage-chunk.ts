import { exportOrganizationUsageReports } from '@/api-client';
import { handleBillingProblem } from '@/domains/billing';
import { downloadBlob } from '@/lib/download-blob';
import { type UsageChunk, usageChunkFilename } from '../utils/usage-chunks';

/** How far before `to` the API starts a request that names no `from`: thirty days. */
const DEFAULT_SPAN_MS = 30 * 24 * 60 * 60 * 1000;

/** How long after the instant a refusal names the second read starts, when it has to name one. */
const RETENTION_MARGIN_MS = 60_000;

/**
 * Where the second read starts when the API refused the first for reaching before the
 * usage it keeps, or `undefined` for none.
 *
 * The API computes where the kept usage begins on every request, to the millisecond, from
 * its clock: the instant a refusal names is already behind it when the second read arrives,
 * so a `from` set to it is refused again, whenever it is sent. What the API promises is that
 * a `from` that is left out is moved up to that instant by the API itself, and never refused
 * for it. The second read leaves it out, then, when the API's default (thirty days before
 * `to`) reaches no later than the kept usage: nothing of the month is lost. When the month
 * is longer and the kept usage begins within its first day, the default would drop a day of
 * what is kept, and the read starts a minute after the instant named instead, which no
 * request takes longer to reach.
 */
function retentionFrom(retentionStart: string, to: string): string | undefined {
  const kept = Date.parse(retentionStart);
  if (Date.parse(to) - DEFAULT_SPAN_MS <= kept) {
    return undefined;
  }

  return new Date(kept + RETENTION_MARGIN_MS).toISOString();
}

/**
 * Saves the usage reports of every instance for one month as a CSV. The export is
 * a stream behind the bearer token of the session, so the request is the client's
 * and the browser is handed the blob; a refusal is thrown as the SDK throws it, for
 * the caller to show.
 *
 * The oldest month a deployment lists begins before the usage it keeps does, since
 * the retention is told in months and not to the day. The API then refuses with
 * where the kept usage begins, and the month is read again from there (see
 * `retentionFrom`), once: that leaves the person with the part of the month that
 * exists. A month that ends before that has nothing to read, and the refusal says so.
 */
export async function downloadUsageChunk(
  chunk: UsageChunk,
  now?: Date,
): Promise<void> {
  const save = (from: string | undefined) =>
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
      await save(retentionFrom(retentionStart, chunk.to));

      return;
    }
    throw error;
  }
}
