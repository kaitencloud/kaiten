import { cn } from '@/lib/utils';
import {
  getMaximumAllowedUsage,
  isSoftLimit,
} from '../entitlement-enforcement';
import {
  getUsageStatus,
  getUsageStatusTone,
} from '../entitlement-usage-status';

type UsageMeterProps = {
  /** Width comes from the caller: full in a card row, `w-16` in a table cell. */
  className?: string;
  limitCapExceededOveragePercent?: number | null;
  /** `sm` for a table cell, `md` for a card row. */
  size?: 'md' | 'sm';
  threshold: number | null | undefined;
  value: number;
};

const TRACK_HEIGHT = { md: 'h-3', sm: 'h-1.5' } as const;

// The tolerated overage, drawn on the track even while unused so a soft limit
// shows before anyone reaches it.
const ALLOWANCE_BAND =
  'repeating-linear-gradient(135deg, color-mix(in srgb, var(--warning) 45%, transparent) 0 3px, transparent 3px 7px)';

const share = (part: number, whole: number) =>
  whole === 0
    ? part > 0
      ? 100
      : 0
    : Math.max(0, Math.min(100, (part / whole) * 100));

/**
 * A usage counter against its grant, the way the grant enforces it. The track
 * runs from nothing to the most the API accepts. A tick marks the granted
 * value; on a hard limit that is the end of the track, on a soft limit the
 * hatched band after it is the overage the grant tolerates. Usage past the
 * grant fills that band in the alert colour, and usage past the wall — a
 * threshold lowered after the fact — turns the whole fill red.
 *
 * Renders nothing when nothing caps the counter: with no wall there is
 * nothing to measure against, and a half-full bar would be a lie. The figures
 * beside the meter carry its values, so the drawing itself is decorative.
 */
export function UsageMeter({
  className,
  limitCapExceededOveragePercent,
  size = 'md',
  threshold,
  value,
}: UsageMeterProps) {
  const ceiling = getMaximumAllowedUsage(
    threshold,
    limitCapExceededOveragePercent,
  );

  if (ceiling === null) {
    return null;
  }

  const status = getUsageStatus(
    value,
    threshold,
    limitCapExceededOveragePercent,
  );
  const soft = isSoftLimit(threshold, limitCapExceededOveragePercent);
  const grant = soft ? share(threshold ?? 0, ceiling) : 100;
  const used = share(value, ceiling);
  const contract = Math.min(used, grant);
  const allowance = Math.max(0, used - grant);
  const tone = getUsageStatusTone(status);
  const contractFill =
    status === 'IN_ALLOWANCE' ? getUsageStatusTone('HEALTHY').fill : tone.fill;

  return (
    <div
      aria-hidden="true"
      className={cn('relative', className)}
      data-status={status}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-full bg-muted',
          TRACK_HEIGHT[size],
        )}
      >
        {soft ? (
          <div
            className="absolute inset-y-0 right-0"
            data-segment="band"
            style={{ backgroundImage: ALLOWANCE_BAND, left: `${grant}%` }}
          />
        ) : null}
        <div
          className={cn('absolute inset-y-0 left-0', contractFill)}
          data-segment="contract"
          style={{ width: `${contract}%` }}
        />
        {allowance > 0 ? (
          <div
            className={cn('absolute inset-y-0', tone.fill)}
            data-segment="allowance"
            style={{ left: `${grant}%`, width: `${allowance}%` }}
          />
        ) : null}
      </div>
      {/* The granted value: where what was bought runs out. */}
      <div
        className="absolute -inset-y-0.5 w-px bg-foreground/70"
        data-segment="grant"
        style={{ left: `calc(${grant}% - 0.5px)` }}
      />
    </div>
  );
}
