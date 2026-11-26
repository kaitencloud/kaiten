import type { TFunction } from 'i18next';
import type { KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { WebhookDelivery } from '../../types';
import {
  describeDeliveryOutcome,
  getDeliveryTone,
  OUTCOME_SEPARATOR,
  parseTimestamp,
} from '../../utils/webhook-deliveries';
import { getWebhookEventLabel } from '../../utils/webhook-events';
import { formatDeliveryTime } from './webhook-delivery-format';
import { DELIVERY_STATUS_PRESENTATION } from './webhook-delivery-status';

const CHRONOLOGY_KEY = 'Pages.Integrations.Webhooks.Deliveries.Chronology';

/**
 * saas-api applies the Slack or Google Chat formatting right after a create,
 * which may touch the webhook's update time: an update this close to the
 * creation is not one a person made.
 */
const UPDATE_TOLERANCE_MS = 60_000;

export interface WebhookMilestone {
  kind: 'created' | 'updated';
  at: string;
}

/**
 * The webhook's own dates, closing the chronology: updated (when it was
 * edited after its creation), then created. A date that does not parse is
 * left out rather than shown as a dash.
 */
export function getWebhookMilestones(
  createdAt?: string,
  updatedAt?: string,
): WebhookMilestone[] {
  const created = parseTimestamp(createdAt);
  const updated = parseTimestamp(updatedAt);
  if (created === undefined || !createdAt) {
    return [];
  }
  const milestones: WebhookMilestone[] = [];
  if (
    updated !== undefined &&
    updatedAt &&
    updated - created > UPDATE_TOLERANCE_MS
  ) {
    milestones.push({ kind: 'updated', at: updatedAt });
  }
  milestones.push({ kind: 'created', at: createdAt });

  return milestones;
}

const FOCUS_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/**
 * Arrow keys, Home and End move the focus between deliveries without selecting
 * one, so that walking the list does not read a delivery per key press.
 */
function handleChronologyKeyDown(event: KeyboardEvent<HTMLOListElement>) {
  if (!FOCUS_KEYS.has(event.key)) {
    return;
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[data-delivery-key]',
    ),
  );
  if (buttons.length === 0) {
    return;
  }
  const current = buttons.findIndex((button) => button === event.target);
  const last = buttons.length - 1;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowDown'
          ? Math.min(last, current + 1)
          : Math.max(0, current - 1);
  event.preventDefault();
  buttons[next]?.focus();
}

function Rail({ children }: { children: ReactNode }) {
  return (
    <>
      <span
        aria-hidden
        className="absolute top-7 bottom-1 left-3 w-px bg-border group-last:hidden"
      />
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center"
      >
        {children}
      </span>
    </>
  );
}

function eventLabel(delivery: WebhookDelivery, t: TFunction) {
  return delivery.eventType
    ? getWebhookEventLabel(delivery.eventType, t)
    : t('Pages.Integrations.Webhooks.Deliveries.Detail.unknownEvent');
}

function DeliveryItem({
  delivery,
  onSelect,
  selected,
}: {
  delivery: WebhookDelivery;
  onSelect: (key: string) => void;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const presentation = DELIVERY_STATUS_PRESENTATION[getDeliveryTone(delivery)];

  function handleClick() {
    onSelect(delivery.key);
  }

  return (
    <li className="group relative flex gap-2 pb-2 last:pb-0">
      <Rail>
        <span
          className={cn(
            'size-3 rounded-full ring-4 ring-background',
            presentation.markClassName,
          )}
        />
      </Rail>
      <button
        aria-current={selected ? 'true' : undefined}
        className={cn(
          // Muted, not the accent: the outcome keeps its status colour, which
          // must stay readable on the selection.
          'min-w-0 flex-1 rounded-md px-2 py-1 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'bg-muted hover:bg-muted',
        )}
        data-delivery-key={delivery.key}
        onClick={handleClick}
        type="button"
      >
        <time
          className="block text-xs text-muted-foreground"
          dateTime={delivery.timestamp}
        >
          {formatDeliveryTime(delivery.timestamp)}
        </time>
        <span className="block truncate text-sm font-medium">
          {eventLabel(delivery, t)}
        </span>
        <span className={cn('block text-xs', presentation.textClassName)}>
          {describeDeliveryOutcome(delivery, t).join(OUTCOME_SEPARATOR)}
        </span>
      </button>
    </li>
  );
}

function MilestoneItem({ milestone }: { milestone: WebhookMilestone }) {
  const { t } = useTranslation();

  return (
    <li className="group relative flex gap-2 pb-2 last:pb-0">
      <Rail>
        <span className="size-3 rounded-full border-2 border-muted-foreground bg-background ring-4 ring-background" />
      </Rail>
      <div className="min-w-0 flex-1 px-2 py-1">
        <time
          className="block text-xs text-muted-foreground"
          dateTime={milestone.at}
        >
          {formatDeliveryTime(milestone.at)}
        </time>
        <span className="block text-sm text-muted-foreground">
          {t(`${CHRONOLOGY_KEY}.${milestone.kind}`)}
        </span>
      </div>
    </li>
  );
}

function renderMilestone(milestone: WebhookMilestone) {
  return <MilestoneItem key={milestone.kind} milestone={milestone} />;
}

interface WebhookDeliveryChronologyProps {
  /** Newest first. */
  deliveries: WebhookDelivery[];
  selectedKey?: string;
  onSelect: (key: string) => void;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A webhook's deliveries as a timeline, newest first, each a dot coloured by
 * its state, its time, its event and its outcome; the webhook's update and
 * creation close it. A delivery is selected by click, Enter or Space.
 */
export function WebhookDeliveryChronology({
  deliveries,
  selectedKey,
  onSelect,
  createdAt,
  updatedAt,
}: WebhookDeliveryChronologyProps) {
  const { t } = useTranslation();

  function renderDelivery(delivery: WebhookDelivery) {
    return (
      <DeliveryItem
        key={delivery.key}
        delivery={delivery}
        onSelect={onSelect}
        selected={delivery.key === selectedKey}
      />
    );
  }

  return (
    <ol
      aria-label={t(`${CHRONOLOGY_KEY}.label`)}
      className="flex flex-col"
      onKeyDown={handleChronologyKeyDown}
    >
      {deliveries.map(renderDelivery)}
      {getWebhookMilestones(createdAt, updatedAt).map(renderMilestone)}
    </ol>
  );
}

function renderSkeletonItem(index: number) {
  return (
    <li className="flex gap-2" key={index}>
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5 py-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
    </li>
  );
}

/** Four placeholder deliveries while the list loads. */
export function WebhookDeliveryChronologySkeleton() {
  return (
    <ul aria-busy="true" className="flex flex-col gap-4">
      {[0, 1, 2, 3].map(renderSkeletonItem)}
    </ul>
  );
}
