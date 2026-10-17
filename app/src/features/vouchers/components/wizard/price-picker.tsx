import { useTranslation } from 'react-i18next';
import { PagedListSkeleton, RetryableProblem } from '@/domains/billing';
import type { PriceOption } from '../../types';
import { ReferenceChecklist } from './reference-checklist';

type PricePickerProps = {
  /** Why the prices could not be read, or null. */
  error: unknown;
  isPending: boolean;
  onChange: (ids: string[]) => void;
  onRetry: () => void;
  options: readonly PriceOption[];
  /** The prices checked: those of a license and those of an add-on, together. */
  value: readonly string[];
};

/**
 * The prices a discount can be limited to, listed under the version each belongs to:
 * a license version's, then an add-on version's. The API gives a price no owner of its
 * own, and one price may be offered by a version that is no longer on sale, so the
 * owner is named on every row and a deprecated price says so.
 */
export function PricePicker({
  error,
  isPending,
  onChange,
  onRetry,
  options,
  value,
}: PricePickerProps) {
  const { t } = useTranslation();

  if (error) {
    return <RetryableProblem error={error} onRetry={onRetry} />;
  }
  if (isPending) {
    return (
      <PagedListSkeleton
        label={t('Pages.Vouchers.Wizard.Prices.loading')}
        rowClassName="h-11"
        rows={4}
      />
    );
  }
  if (options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('Pages.Vouchers.Wizard.Prices.none')}
      </p>
    );
  }

  return (
    <ReferenceChecklist
      label={t('Pages.Vouchers.Wizard.Prices.label')}
      onChange={onChange}
      options={options.map((option) => ({
        detail: option.deprecated
          ? t('Pages.Vouchers.Wizard.Prices.deprecated', {
              amount: option.amount,
            })
          : option.amount,
        id: option.id,
        label: `${option.owner} · ${option.label}`,
        muted: option.deprecated,
      }))}
      value={value}
    />
  );
}
