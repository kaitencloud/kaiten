import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { UNLIMITED_THRESHOLD } from '@/domains/entitlement-usage';
import { formatDecimalQuantity, multiplyDecimalStrings } from '@/lib/decimal';
import type { InstanceCombinedSource } from '../../../../utils/combined-usage';

const KEY = 'Pages.Customers.Instances.Detail.entitlements.combined';

// A usage or a limit as a plain decimal string, which `String` does not write for the
// largest and the smallest numbers.
const asDecimal = (value: number): string =>
  value.toLocaleString('en-US', {
    maximumFractionDigits: 10,
    useGrouping: false,
  });

/**
 * How a combined entitlement is made on an instance: what each source it sums counts,
 * and what that is worth at its weight. The API computes the sum and the limit; this
 * is the same arithmetic spelled out, with the figures the API sent for each source,
 * so that a total that looks too high or too low can be followed back to its source.
 * The limit of the sum is unlimited as soon as a source is.
 */
export function CombinedSourcesBreakdown({
  locale,
  name,
  sources,
}: {
  /** The language the figures are written in, as the rest of the row writes them. */
  locale: string;
  name: string;
  sources: readonly InstanceCombinedSource[] | null | undefined;
}) {
  const { t } = useTranslation();

  if (!sources?.length) {
    return null;
  }

  const unlimited = t(`${KEY}.unlimited`);
  const renderSource = (source: InstanceCombinedSource) => {
    const isUnlimited = source.limit === UNLIMITED_THRESHOLD;
    const counted = (value: number) =>
      formatDecimalQuantity(
        multiplyDecimalStrings(asDecimal(value), source.weight),
        locale,
      );

    return (
      <li key={source.entitlementSlug}>
        {t(`${KEY}.source`, {
          counted: counted(source.usage),
          countedLimit: isUnlimited ? unlimited : counted(source.limit),
          limit: isUnlimited ? unlimited : source.limit.toLocaleString(locale),
          name: source.entitlementName,
          usage: source.usage.toLocaleString(locale),
          weight: formatDecimalQuantity(source.weight, locale),
        })}
      </li>
    );
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-label={t(`${KEY}.triggerName`, { name })}
            data-row-actions
            size="sm"
            variant="ghost"
          />
        }
      >
        {t(`${KEY}.trigger`)}
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)]">
        <PopoverHeader>
          <PopoverTitle>{t(`${KEY}.title`)}</PopoverTitle>
        </PopoverHeader>
        <ul
          className="space-y-2 break-words text-sm"
          data-testid="combined-sources"
        >
          {sources.map(renderSource)}
        </ul>
        <p className="text-xs text-muted-foreground">{t(`${KEY}.hint`)}</p>
      </PopoverContent>
    </Popover>
  );
}
