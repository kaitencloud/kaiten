import type { TFunction } from 'i18next';
import { SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AuditDayGroup, GlobalAuditEntry } from '../audit-trail.types';
import { formatDayHeading, groupEntriesByDay } from '../audit-trail.utils';
import { AUDIT_GRID, AuditEventRow } from './audit-trail-event-row';

function renderRow(entry: GlobalAuditEntry) {
  return <AuditEventRow key={entry.id} entry={entry} />;
}

function FeedColumnHeader({ t }: { t: TFunction }) {
  return (
    <div className={cn('hidden border-b px-3 pb-2 sm:grid', AUDIT_GRID)}>
      <span aria-hidden />
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('Pages.AuditTrail.table.headers.event')}
      </span>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('Pages.AuditTrail.table.headers.instance')}
      </span>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('Pages.AuditTrail.table.headers.customer')}
      </span>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('Pages.AuditTrail.table.headers.status')}
      </span>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t('Pages.AuditTrail.table.headers.timestamp')}
      </span>
      <span aria-hidden />
    </div>
  );
}

function DayGroup({ group, t }: { group: AuditDayGroup; t: TFunction }) {
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-1 py-1">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {group.heading}
        </h3>
        <span className="text-xs text-muted-foreground/50">
          {t('Pages.AuditTrail.feed.eventsCount', {
            count: group.entries.length,
          })}
        </span>
      </div>
      <div className="flex flex-col gap-1">{group.entries.map(renderRow)}</div>
    </section>
  );
}

function AuditTrailFeedEmpty({ t }: { t: TFunction }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <SearchX className="size-10 text-muted-foreground/40" aria-hidden />
      <p className="text-sm text-muted-foreground">
        {t('Pages.AuditTrail.table.empty')}
      </p>
    </div>
  );
}

export function AuditTrailFeed({ entries }: { entries: GlobalAuditEntry[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';

  const dayLabels = useMemo(
    () => ({
      today: t('Pages.AuditTrail.feed.today'),
      yesterday: t('Pages.AuditTrail.feed.yesterday'),
    }),
    [t],
  );
  const groups = useMemo(
    () =>
      groupEntriesByDay(entries, (timestamp) =>
        formatDayHeading(timestamp, locale, dayLabels),
      ),
    [dayLabels, entries, locale],
  );

  const renderDayGroup = (group: AuditDayGroup) => (
    <DayGroup key={group.key} group={group} t={t} />
  );

  if (entries.length === 0) {
    return <AuditTrailFeedEmpty t={t} />;
  }

  return (
    <div className="flex h-full flex-col">
      <FeedColumnHeader t={t} />
      <div className="flex flex-1 flex-col gap-5 overflow-auto pt-3 pr-1">
        {groups.map(renderDayGroup)}
      </div>
    </div>
  );
}
