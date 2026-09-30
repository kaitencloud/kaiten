import {
  Activity,
  AlertTriangle,
  CheckCircle,
  type LucideIcon,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { GlobalAuditEntry } from '../audit-trail.types';
import { getEventCategory } from '../audit-trail.utils';

interface StatCardConfig {
  id: string;
  label: ReactNode;
  value: number;
  Icon: LucideIcon;
  // Surface and icon as one authored pair. These used to be two fields — a solid
  // state token as the icon colour over a 10% alpha dilution of that same token —
  // which put three of the four tiles under even the 3:1 non-text floor (the
  // rejected tile reached 2.54:1 on the dark card). The `-subtle` pair exists for
  // exactly this tile, and keeping both utilities in one string is what lets
  // `scripts/check-token-contrast.mjs` see and hold the pair.
  tile: string;
}

function StatCard({ label, value, Icon, tile }: StatCardConfig) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          tile,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xl leading-none font-semibold tabular-nums">
          {value}
        </p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function renderStatCard(stat: StatCardConfig) {
  return <StatCard key={stat.id} {...stat} />;
}

export function AuditTrailStatsCards({
  entries,
  limit,
}: {
  entries: GlobalAuditEntry[];
  /** Size of the fetched window: a full window is "the latest N", not a total. */
  limit?: number;
}) {
  const { t } = useTranslation();
  const isWindow = limit !== undefined && entries.length >= limit;

  const countByCategory = (category: string) =>
    entries.filter((entry) => getEventCategory(entry.eventName) === category)
      .length;

  const stats: StatCardConfig[] = [
    {
      id: 'total',
      label: isWindow
        ? t('Pages.AuditTrail.stats.latestEvents', { count: limit })
        : t('Pages.AuditTrail.stats.totalEvents'),
      value: entries.length,
      Icon: Activity,
      tile: 'bg-primary-subtle text-primary-subtle-foreground',
    },
    {
      id: 'accepted',
      label: t('Pages.AuditTrail.stats.accepted'),
      value: countByCategory('accepted'),
      Icon: CheckCircle,
      tile: 'bg-success-subtle text-success-subtle-foreground',
    },
    {
      id: 'rejected',
      label: t('Pages.AuditTrail.stats.rejected'),
      value: countByCategory('rejected'),
      Icon: XCircle,
      tile: 'bg-destructive-subtle text-destructive-subtle-foreground',
    },
    {
      id: 'warnings',
      label: t('Pages.AuditTrail.stats.warnings'),
      value: countByCategory('warning'),
      Icon: AlertTriangle,
      tile: 'bg-warning-subtle text-warning-subtle-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(renderStatCard)}
    </div>
  );
}
