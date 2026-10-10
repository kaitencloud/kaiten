import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { TableEmptyMessage } from '@/domains/billing';

type VouchersEmptyProps = {
  /** Takes every filter of the list off. */
  onClearFilters: () => void;
};

/**
 * What the table says when a search or a filter hides every voucher: that it does, and
 * the way back. A list with no voucher at all is not this: it is the empty state of the
 * page, which says where a voucher comes from.
 */
export function VouchersEmpty({ onClearFilters }: VouchersEmptyProps) {
  const { t } = useTranslation();

  return (
    <TableEmptyMessage
      description={t('Pages.Vouchers.List.Empty.filteredDescription')}
      testId="vouchers-filtered-empty"
      title={t('Pages.Vouchers.List.Empty.filteredTitle')}
    >
      <Button onClick={onClearFilters} size="sm" variant="outline">
        {t('Pages.Vouchers.List.Filters.clear')}
      </Button>
    </TableEmptyMessage>
  );
}
