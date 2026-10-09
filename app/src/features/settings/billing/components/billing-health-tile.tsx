import { Link } from '@tanstack/react-router';
import {
  CircleAlert,
  Clock,
  CloudOff,
  Hourglass,
  Inbox,
  Lock,
  type LucideIcon,
  Scale,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getHoldReasonLabelKey, isKnownHoldReason } from '@/domains/billing';
import { StatCard } from '@/functionals/stat-card';
import { formatRelativeTimeToNow } from '@/lib/feed-time';
import { cn } from '@/lib/utils';
import type {
  HealthItem,
  HealthItemId,
  HealthLink,
} from '../utils/billing-health';

// One icon for each thing the health counts: a thing the API adds fails the type
// check until it has one.
const ICONS = {
  closeBacklog: Hourglass,
  handoff: Inbox,
  held: Lock,
  mismatches: Scale,
  overdue: Clock,
  pastDue: CircleAlert,
  pushFailures: CloudOff,
} as const satisfies Record<HealthItemId, LucideIcon>;

// What does not get better by itself reads as a failure; what is late, as a warning.
const FAILURES: readonly HealthItemId[] = ['pastDue', 'pushFailures'];

type BillingHealthTileProps = {
  item: HealthItem;
};

const LINK_CLASS =
  'text-foreground underline-offset-4 outline-none after:absolute after:inset-0 hover:underline focus-visible:underline';

/** The label of a tile that leads somewhere, as the link that stretches over the whole tile. */
function TileLink({ children, link }: { children: string; link: HealthLink }) {
  return link.to === '/billing/handoff' ? (
    <Link className={LINK_CLASS} to="/billing/handoff">
      {children}
    </Link>
  ) : (
    <Link className={LINK_CLASS} search={link.search} to="/billing/invoices">
      {children}
    </Link>
  );
}

/** The helper under a count: how long the oldest has waited, or why they are there. */
function useHelper(item: HealthItem) {
  const { i18n, t } = useTranslation();
  const base = `Pages.Settings.Billing.Health.Items.${item.id}`;
  const ago = item.oldestAt
    ? formatRelativeTimeToNow(item.oldestAt, i18n.language)
    : undefined;

  if (item.id === 'held' && item.reasons && item.reasons.length > 0) {
    return item.reasons
      .map(({ reason }) =>
        isKnownHoldReason(reason) ? t(getHoldReasonLabelKey(reason)) : reason,
      )
      .join(' · ');
  }

  return ago ? t(`${base}.oldest`, { ago }) : t(`${base}.helper`);
}

/**
 * One thing the health of billing counts, as a figure. A count above zero is drawn
 * as something that needs attention, and where something lists what it counts (the
 * invoices on a filter, the queue of the accounting system) the figure is a link to it.
 * A zero is muted and leads nowhere, since there would be nothing to see. The health,
 * the list of invoices and the queue are read with the same scope, so a session that
 * sees the figure may follow it.
 */
export function BillingHealthTile({ item }: BillingHealthTileProps) {
  const { i18n, t } = useTranslation();
  const Icon = ICONS[item.id];
  const helper = useHelper(item);
  const label = t(`Pages.Settings.Billing.Health.Items.${item.id}.label`);
  const needsAttention = item.count > 0;
  const link = needsAttention ? item.link : undefined;

  return (
    <StatCard
      className={cn(
        'relative',
        link &&
          'transition-colors hover:bg-muted/40 has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50',
      )}
      data-count={item.count}
      data-testid={`billing-health-${item.id}`}
    >
      <StatCard.Label>
        {link ? <TileLink link={link}>{label}</TileLink> : label}
      </StatCard.Label>
      <StatCard.Icon
        className={cn(
          needsAttention &&
            (FAILURES.includes(item.id)
              ? 'text-destructive-subtle-foreground'
              : 'text-warning-subtle-foreground'),
        )}
      >
        <Icon aria-hidden />
      </StatCard.Icon>
      <StatCard.Value
        className={cn(!needsAttention && 'text-muted-foreground')}
      >
        {new Intl.NumberFormat(i18n.language).format(item.count)}
      </StatCard.Value>
      <StatCard.Helper>{helper}</StatCard.Helper>
    </StatCard>
  );
}
