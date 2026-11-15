const DAY_MS = 86_400_000;

/** Below this much of a window elapsed, a daily pace is noise and none is given. */
export const MIN_ELAPSED_MS = DAY_MS;

export type ProjectionInput = {
  consumed: number;
  /** Open holds, counted as if they were committed. */
  reserved: number;
  /** Included credits; negative when unlimited. */
  limit: number;
  /** Included plus overage; null when unlimited. */
  maximum: number | null;
  /** Start and end of the window; absent for a lifetime pool. */
  windowStart?: string | null;
  windowEnd?: string | null;
  now: number;
};

/** When a threshold is crossed at the current pace. */
export type Crossing =
  /** Already at or past it. */
  | { kind: 'REACHED' }
  /** On this date, before the window resets. */
  | { kind: 'ON'; at: string }
  /** Not before the window resets. */
  | { kind: 'AFTER_RESET' };

export type Projection = {
  /** Credits a day since the window started, open holds included. */
  perDay: number;
  included: Crossing;
  /** Null when the maximum is the included limit (no overage). */
  maximum: Crossing | null;
  resetsAt: string;
};

function crossing(
  used: number,
  threshold: number,
  perDay: number,
  now: number,
  end: number,
): Crossing {
  if (used >= threshold) {
    return { kind: 'REACHED' };
  }
  const at = now + ((threshold - used) / perDay) * DAY_MS;

  return at >= end
    ? { kind: 'AFTER_RESET' }
    : { kind: 'ON', at: new Date(at).toISOString() };
}

/**
 * The pace of a windowed pool and when, at that pace, its included credits and
 * its maximum run out. None for an unlimited or lifetime pool, before a day of
 * the window has passed, or when nothing was used: a projection from too
 * little data would read as a forecast it is not.
 */
export function projectPool(input: ProjectionInput): Projection | null {
  const { consumed, reserved, limit, maximum, now } = input;
  if (!input.windowStart || !input.windowEnd) {
    return null;
  }
  if (limit < 0 || maximum === null) {
    return null;
  }
  const start = Date.parse(input.windowStart);
  const end = Date.parse(input.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now >= end) {
    return null;
  }
  const elapsed = now - start;
  const used = consumed + reserved;
  if (elapsed < MIN_ELAPSED_MS || used <= 0) {
    return null;
  }
  const perDay = used / (elapsed / DAY_MS);

  return {
    perDay,
    included: crossing(used, limit, perDay, now, end),
    maximum: maximum > limit ? crossing(used, maximum, perDay, now, end) : null,
    resetsAt: new Date(end).toISOString(),
  };
}
