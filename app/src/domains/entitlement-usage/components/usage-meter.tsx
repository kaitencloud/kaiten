import { cn } from '@/lib/utils';
import { getMaximumAllowedUsage } from '../entitlement-enforcement';
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
 * runs from nothing to the most the API accepts. When the grant tolerates an
 * overage, a tick marks the granted value and the hatched band after it is
 * that overage. When it tolerates none, as on a hard limit or on a soft one
 * over a grant of nothing (any share of zero is zero), the granted value is
 * the end of the track and needs no mark of its own. Usage past the grant
 * fills the band in the alert colour; once it reaches the wall, or passes it
 * after a threshold was lowered, the whole fill turns red.
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
  // Room past the grant, which isSoftLimit alone misses on a grant of nothing.
  const hasAllowance = ceiling > (threshold ?? 0);
  const grant = hasAllowance ? share(threshold ?? 0, ceiling) : 100;
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
        {hasAllowance ? (
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
      {hasAllowance ? (
        <div
          className="absolute -inset-y-0.5 w-px bg-foreground/70"
          data-segment="grant"
          style={{ left: `calc(${grant}% - 0.5px)` }}
        />
      ) : null}
    </div>
  );
}
