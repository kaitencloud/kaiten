import type { TFunction } from 'i18next';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, getAuditDisplayName } from '@/lib/detail';
import { cn } from '@/lib/utils';
import { resolveEventLabel, resolveEventReason } from '../audit-trail-events';
import type { GlobalAuditEntry } from '../audit-trail.types';
import { formatRelativeTimeToNow, formatTimeOfDay } from '@/lib/feed-time';
import { getEventCategory } from '../audit-trail.utils';
import { AuditStatusBadge, getEventIcon } from './audit-trail-event-visuals';

// Shared grid template so the feed column header and every row stay aligned:
// icon | Event | Instance | Customer | Actor | Status | Time | chevron
// Every class is for `sm` and up: the header and the rows are `hidden` below it, and a
// bare `grid` here would win over that `hidden` once the classes are merged, drawing the
// desktop grid on a phone beside the row made for it.
export const AUDIT_GRID =
  'sm:grid sm:grid-cols-[2.25rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_8rem_1.25rem] sm:items-center sm:gap-3';

// Who the entry is recorded under, named as a record's author is everywhere
// else: Kaiten itself reads "Kaiten (system)". An entry recorded before the API
// kept actors has none.
const actorLabel = (entry: GlobalAuditEntry) =>
  getAuditDisplayName({ actor: entry.actor }) || '—';

function EventIconCircle({ entry }: { entry: GlobalAuditEntry }) {
  const { Icon, iconText, tint } = getEventIcon(
    getEventCategory(entry.eventName),
  );
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full',
        tint,
      )}
    >
      <Icon className={cn('size-4', iconText)} aria-hidden />
    </span>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('break-words text-sm', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
}

function AuditEventRowDetail({
  entry,
  t,
  locale,
}: {
  entry: GlobalAuditEntry;
  t: TFunction;
  locale: string;
}) {
  const reason = resolveEventReason(entry.eventName, entry.payload, t);

  return (
    <div className="border-t px-3 py-3 sm:pl-[3.75rem]">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <DetailItem
          label={t('Pages.AuditTrail.detail.eventId')}
          value={`#${entry.id}`}
          mono
        />
        <DetailItem
          label={t('Pages.AuditTrail.detail.eventType')}
          value={entry.eventType}
          mono
        />
        <DetailItem
          label={t('Pages.AuditTrail.detail.instance')}
          value={entry.instanceName ?? '—'}
        />
        <DetailItem
          label={t('Pages.AuditTrail.detail.customer')}
          value={entry.customerName ?? '—'}
        />
        <DetailItem
          label={t('Pages.AuditTrail.detail.actor')}
          value={actorLabel(entry)}
        />
        <DetailItem
          label={t('Pages.AuditTrail.detail.timestamp')}
          value={formatDateTime(entry.timestamp, locale)}
        />
        {reason ? (
          <DetailItem label={t('Pages.AuditTrail.detail.reason')} value={reason} />
        ) : null}
      </dl>
      {entry.payload != null && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t('Pages.AuditTrail.detail.fullPayload')}
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground">
            {JSON.stringify(entry.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function AuditEventRowDesktop({
  entry,
  t,
  locale,
  open,
}: {
  entry: GlobalAuditEntry;
  t: TFunction;
  locale: string;
  open: boolean;
}) {
  return (
    <div className={cn('hidden px-3 py-2.5', AUDIT_GRID)}>
      <EventIconCircle entry={entry} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {resolveEventLabel(entry.eventName, t)}
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {entry.eventName}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm">{entry.instanceName ?? '—'}</p>
        {entry.instanceSlug != null && (
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {entry.instanceSlug}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm">{entry.customerName ?? '—'}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm">{actorLabel(entry)}</p>
      </div>
      <div>
        <AuditStatusBadge eventName={entry.eventName} t={t} />
      </div>
      <div title={formatDateTime(entry.timestamp, locale)}>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTimeToNow(entry.timestamp, locale)}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {formatTimeOfDay(entry.timestamp, locale)}
        </p>
      </div>
      <ChevronRight
        className={cn(
          'size-4 text-muted-foreground transition-transform',
          open && 'rotate-90',
        )}
        aria-hidden
      />
    </div>
  );
}

function AuditEventRowMobile({
  entry,
  t,
  locale,
  open,
}: {
  entry: GlobalAuditEntry;
  t: TFunction;
  locale: string;
  open: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 sm:hidden">
      <EventIconCircle entry={entry} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {resolveEventLabel(entry.eventName, t)}
          </span>
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <AuditStatusBadge eventName={entry.eventName} t={t} />
          <span
            className="text-xs text-muted-foreground"
            title={formatDateTime(entry.timestamp, locale)}
          >
            {formatRelativeTimeToNow(entry.timestamp, locale)}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">
            {entry.instanceName ?? '—'}
          </span>
          {' · '}
          {entry.customerName ?? '—'}
          {' · '}
          {actorLabel(entry)}
        </p>
      </div>
    </div>
  );
}

export function AuditEventRow({ entry }: { entry: GlobalAuditEntry }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        open
          ? 'border-border bg-muted/30'
          : 'border-transparent hover:border-border hover:bg-muted/20',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <AuditEventRowDesktop entry={entry} t={t} locale={locale} open={open} />
        <AuditEventRowMobile entry={entry} t={t} locale={locale} open={open} />
      </button>
      {open && <AuditEventRowDetail entry={entry} t={t} locale={locale} />}
    </div>
  );
}
