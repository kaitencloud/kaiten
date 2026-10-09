import { CircleAlert, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  BILLING_PERIOD_LABEL_KEYS,
  getPriceAmountParts,
  joinPriceAmount,
} from '@/domains/billing';
import { cn } from '@/lib/utils';
import type { PeriodSlot } from '../../utils/addon-price.utils';

type PeriodSlotsProps = {
  slots: readonly PeriodSlot[];
};

// What a slot without a default says. Written out in full, so that a key that does not
// exist fails the check of the keys.
const MISSING_KEYS = {
  missing: 'Pages.Addons.Prices.Slots.missing',
  noDefault: 'Pages.Addons.Prices.Slots.noDefault',
} as const;

function Slot({ slot }: { slot: PeriodSlot }) {
  const { i18n, t } = useTranslation();
  const label = t(BILLING_PERIOD_LABEL_KEYS[slot.period]);
  const ready = slot.status === 'default' && slot.price !== undefined;
  const Icon = ready ? CircleCheck : CircleAlert;

  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        ready ? 'bg-card' : 'border-dashed',
      )}
      data-period={slot.period}
      data-status={slot.status}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          ready
            ? 'text-success-subtle-foreground'
            : 'text-warning-subtle-foreground',
        )}
      />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">
          {slot.price
            ? joinPriceAmount(
                getPriceAmountParts(slot.price, undefined, t, i18n.language),
              )
            : t(
                MISSING_KEYS[
                  slot.status === 'noDefault' ? 'noDefault' : 'missing'
                ],
                { period: label.toLowerCase() },
              )}
        </p>
      </div>
    </li>
  );
}

/**
 * One slot per billing period the version is sold for. Of a version's flat fees the
 * default active one whose period is the subscription's is the one billed, so a
 * period with none is a subscription the version cannot be attached to: the slot says
 * so, and a missing annual price shows before the first annual customer meets the
 * refusal.
 */
export function PeriodSlots({ slots }: PeriodSlotsProps) {
  const { t } = useTranslation();

  if (slots.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={t('Pages.Addons.Prices.Slots.label')}
      className="space-y-2"
    >
      <p className="text-sm font-medium">
        {t('Pages.Addons.Prices.Slots.title')}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {slots.map((slot) => (
          <Slot key={slot.period} slot={slot} />
        ))}
      </ul>
    </section>
  );
}
