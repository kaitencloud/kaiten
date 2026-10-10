import { useTranslation } from 'react-i18next';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  getHighestAcceptedUsage,
  isSoftLimit,
  isUnlimitedThreshold,
} from '@/domains/entitlement-usage';
import {
  explainLimit,
  formatLimitExplanation,
} from '../../../../utils/entitlement-provenance.utils';
import type { InstanceEntitlementRow } from '../../../../utils/instance-detail-entitlements.utils';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

type LimitRow = Pick<
  InstanceEntitlementRow,
  | 'entitlementName'
  | 'entitlementType'
  | 'limitCapExceededOveragePercent'
  | 'provenance'
  | 'source'
  | 'threshold'
>;

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  fromAddons:
    'Pages.Customers.Instances.Detail.entitlements.provenance.fromAddons',
  title: 'Pages.Customers.Instances.Detail.entitlements.provenance.title',
  trigger: 'Pages.Customers.Instances.Detail.entitlements.provenance.trigger',
  unlimited: 'Pages.Customers.Instances.Detail.entitlements.unlimited',
} as const;

// A soft limit still grants `threshold`; the percentage is how far past it the
// API keeps accepting usage. Showing only the granted figure would read as a
// hard cap, which is what the usage bar used to imply. Renders nothing for a
// grant that has no overage to announce, so no caller has to remember to ask.
export function SoftLimitHint({
  locale,
  row,
  t,
}: {
  locale: string;
  row: Pick<
    InstanceEntitlementRow,
    'limitCapExceededOveragePercent' | 'threshold'
  >;
  t: TranslateFn;
}) {
  const highestAcceptedUsage = getHighestAcceptedUsage(
    row.threshold,
    row.limitCapExceededOveragePercent,
  );

  if (
    highestAcceptedUsage === null ||
    !isSoftLimit(row.threshold, row.limitCapExceededOveragePercent)
  ) {
    return null;
  }

  return (
    <span
      className="text-xs text-muted-foreground"
      title={t(
        'Pages.Customers.Instances.Detail.entitlements.softLimitDescription',
        { max: highestAcceptedUsage.toLocaleString(locale) },
      )}
    >
      {t('Pages.Customers.Instances.Detail.entitlements.softLimitHint', {
        percent: row.limitCapExceededOveragePercent,
      })}
    </span>
  );
}

/** The limit as it is read: a dash where there is none to give, "Unlimited", or the figure. */
function formatLimit(row: LimitRow, locale: string, t: TranslateFn): string {
  if (
    row.entitlementType === 'BOOLEAN' ||
    row.entitlementType === 'CONFIG' ||
    row.threshold === null
  ) {
    return '-';
  }

  return isUnlimitedThreshold(row.threshold)
    ? t(KEYS.unlimited)
    : row.threshold.toLocaleString(locale);
}

/**
 * The effective limit of an entitlement. Where the API says how it is composed (the
 * license's grant, the add-ons the instance holds and the vouchers it redeemed), the
 * figure opens a popover that says so, on hover, on focus with Enter or Space, and on
 * a tap: "10,000 license + 3 × 1,000 add-on × 2 voucher = 26,000". A limit that only
 * the license grants (the API sends no composition for it), and a flag or a
 * configuration, is the figure alone.
 */
export function EntitlementLimitFigure({
  locale,
  row,
}: {
  locale: string;
  row: LimitRow;
}) {
  const { t } = useTranslation();
  const figure = formatLimit(row, locale, t);
  const explanation =
    row.entitlementType === 'NUMBER' ? explainLimit(row.provenance) : null;

  if (!explanation) {
    return <span>{figure}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t(KEYS.trigger, {
          entitlement: row.entitlementName,
          limit: figure,
        })}
        className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        closeDelay={100}
        data-row-actions
        data-testid="limit-provenance-trigger"
        delay={150}
        openOnHover
      >
        {figure}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t(KEYS.title)}</PopoverTitle>
          <PopoverDescription data-testid="limit-provenance">
            {formatLimitExplanation(explanation, { locale, t })}
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Says that an entitlement is granted by the add-ons the instance holds and not by
 * its license, next to the limit those add-ons give it.
 */
export function AddonSourceHint({ row }: { row: Pick<LimitRow, 'source'> }) {
  const { t } = useTranslation();

  if (row.source !== 'addon') {
    return null;
  }

  return (
    <span className="text-xs text-muted-foreground" data-testid="limit-source">
      {t(KEYS.fromAddons)}
    </span>
  );
}
