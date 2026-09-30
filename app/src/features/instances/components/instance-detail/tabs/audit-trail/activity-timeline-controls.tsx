import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { ActivityTimelineMode, EventCategory } from './audit-trail.utils';

export const ACTIVITY_SERIES_ORDER: EventCategory[] = [
  'read',
  'accepted',
  'rejected',
  'warning',
];

// Each state names a complete fill+label pair.
//
// The off state is its own colour pair, not element opacity: opacity composites the
// fill and the label onto the backdrop TOGETHER, so both slide toward the same colour
// and the pair collapses (1.91:1 in light). These are `aria-pressed` buttons that are
// still enabled, so WCAG's exemption for disabled controls does not apply.
//
// Hover is the authored `-hover` token rather than `bg-<token>/90`, which dilutes the
// fill toward the page and takes its own white label below AA (`bg-success/90` is
// 3.83:1 on the light card). Keeping fill and label in one string is deliberate:
// `scripts/check-token-contrast.mjs` pairs utilities within a single literal, so every
// state below is covered by the gate.
const CHIP_OFF =
  'bg-secondary text-secondary-foreground border border-border hover:bg-secondary-hover';

const ACTIVITY_SERIES_CHIP: Record<
  EventCategory,
  { on: string; dot: string; offDot: string }
> = {
  read: {
    on: 'bg-primary text-primary-foreground hover:bg-primary-hover',
    dot: 'bg-primary-foreground/30',
    offDot: 'bg-primary',
  },
  accepted: {
    on: 'bg-success text-success-foreground hover:bg-success-hover',
    dot: 'bg-success-foreground/45',
    offDot: 'bg-success',
  },
  rejected: {
    on: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
    dot: 'bg-destructive-foreground/30',
    offDot: 'bg-destructive',
  },
  warning: {
    on: 'bg-warning text-warning-foreground hover:bg-warning-hover',
    dot: 'bg-warning-foreground/45',
    offDot: 'bg-warning',
  },
};

export function ActivityTimelineModeToggle({
  onChange,
  value,
}: {
  onChange: (value: ActivityTimelineMode) => void;
  value: ActivityTimelineMode;
}) {
  const { t } = useTranslation();

  return (
    <ToggleGroup
      type="single"
      value={value}
      variant="outline"
      size="sm"
      onValueChange={(nextValue) => {
        if (nextValue === 'status' || nextValue === 'group') {
          onChange(nextValue);
        }
      }}
      aria-label={t(
        'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.modeLabel',
      )}
    >
      <ToggleGroupItem value="status">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.modes.status',
        )}
      </ToggleGroupItem>
      <ToggleGroupItem value="group">
        {t(
          'Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.modes.group',
        )}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function SeriesVisibilityToggleGroup({
  onToggle,
  visibleSeries,
}: {
  onToggle: (category: EventCategory) => void;
  visibleSeries: Record<EventCategory, boolean>;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIVITY_SERIES_ORDER.map((category) => {
        const enabled = visibleSeries[category];
        const chip = ACTIVITY_SERIES_CHIP[category];

        return (
          <button
            key={category}
            type="button"
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors',
              'shadow-sm',
              enabled ? chip.on : CHIP_OFF,
            )}
            aria-pressed={enabled}
            onClick={() => onToggle(category)}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                enabled ? chip.dot : chip.offDot,
              )}
              aria-hidden
            />
            {t(
              `Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.${category}`,
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GroupModeStatusQuickFilters({
  onToggle,
  visibleSeries,
}: {
  onToggle: (category: EventCategory) => void;
  visibleSeries: Record<EventCategory, boolean>;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
      {ACTIVITY_SERIES_ORDER.map((category) => {
        const enabled = visibleSeries[category];

        return (
          <button
            key={category}
            type="button"
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors',
              // Same defect as the series chips above: `opacity-45` dimmed the label
              // with the fill (3.09:1 light). The off state is now its own outline.
              enabled
                ? 'bg-secondary text-secondary-foreground border-transparent hover:bg-secondary-hover'
                : 'text-muted-foreground border-border hover:bg-secondary',
            )}
            aria-pressed={enabled}
            onClick={() => onToggle(category)}
          >
            {t(
              `Pages.Customers.Instances.Detail.auditTrail.charts.activityTimeline.series.${category}`,
            )}
          </button>
        );
      })}
    </div>
  );
}
