/**
 * Where the usage the organization keeps begins: `months` before now, in UTC,
 * as the API counts it. The capabilities carry the number of months, and carry
 * none when usage is kept forever or the API cannot tell, which leaves no start.
 * It is an approximation of what the API decides to the day, so that a screen
 * can say beforehand what the API would refuse; the API has the last word.
 */
export function getRetentionStart(
  months: number | null | undefined,
  now: number = Date.now(),
): Date | null {
  if (months === null || months === undefined || months <= 0) {
    return null;
  }
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - months);

  return start;
}
