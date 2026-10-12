import { formatFileStamp } from '@/lib/file-stamp';

/** One file of the usage export: a calendar month, in UTC, from its first instant up to the next month's. */
export type UsageChunk = {
  /** The first instant of the month, which the export reads from. */
  from: string;
  /** `2027-03`: names the chunk and its file. */
  key: string;
  /** The first instant of the next month, which the export reads up to, excluded. */
  to: string;
};

/** How many months are listed when the retention is not told: two years. */
export const DEFAULT_CHUNK_MONTHS = 24;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The calendar months the usage export is offered in, newest first: the one `now`
 * falls in and the `months` before it. One export reads 31 days at most, and a
 * month never has more, so each file is one month, which is also how a person
 * thinks of what they are keeping.
 */
export function getUsageChunks(
  months: number,
  now: Date = new Date(),
): UsageChunk[] {
  return Array.from({ length: months + 1 }, (_, back) => {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1);
    const from = new Date(start);
    const to = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1),
    );

    return {
      from: from.toISOString(),
      key: `${from.getUTCFullYear()}-${pad(from.getUTCMonth() + 1)}`,
      to: to.toISOString(),
    };
  });
}

/**
 * The name of the CSV of a month of usage: `usage-2027-03-20270401T090000Z.csv`.
 * The API proposes one, which a browser cannot read from the local stack (its CORS
 * policy does not expose `Content-Disposition`), so the console names the file:
 * the month, and the UTC moment of the download, so that two exports never
 * overwrite each other.
 */
export function usageChunkFilename(
  chunk: Pick<UsageChunk, 'key'>,
  now: Date = new Date(),
): string {
  return `usage-${chunk.key}-${formatFileStamp(now)}.csv`;
}
