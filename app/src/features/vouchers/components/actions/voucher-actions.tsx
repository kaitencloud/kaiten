import { Link } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import { VoucherLifecycleAction } from './voucher-lifecycle-action';

type VoucherActionsProps = {
  voucher: Voucher;
};

/**
 * What can be done to a voucher in the state it is stored in: a draft is edited in the
 * wizard that made it, published, or archived; a published one has its name, description,
 * end date and maximum changed in a dialog, or is archived; the ones the API closed
 * (fully redeemed, expired) and the archived ones can only be read. A discount offers the
 * boost that goes with it. The state read here is the stored one: a voucher past its
 * window still takes the changes that lift it.
 */
export function VoucherActions({ voucher }: VoucherActionsProps) {
  const { t } = useTranslation();
  const mayUpdate = useCanPerform('vouchers.update');
  const mayCreate = useCanPerform('vouchers.create');
  const draft = voucher.status === 'DRAFT';
  const published = voucher.status === 'ACTIVE';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {mayUpdate && draft ? (
        <Button
          nativeButton={false}
          render={
            <Link
              data-voucher-edit
              params={{ voucherId: voucher.id }}
              to="/catalog/vouchers/$voucherId/edit"
            >
              <Pencil className="size-3" />
              {t('Common.edit')}
            </Link>
          }
          role="link"
          size="sm"
          variant="outline"
        />
      ) : null}
      {mayUpdate && published ? (
        <Button
          nativeButton={false}
          render={
            <Link
              data-voucher-edit
              search={(previous) => ({
                ...previous,
                mode: 'configure' as const,
              })}
              to="."
            >
              <Pencil className="size-3" />
              {t('Common.edit')}
            </Link>
          }
          role="link"
          size="sm"
          variant="outline"
        />
      ) : null}
      {mayCreate &&
      voucher.voucherType === 'PRICE' &&
      voucher.status !== 'DRAFT' ? (
        <Button
          nativeButton={false}
          render={
            <Link search={{ boostFor: voucher.id }} to="/catalog/vouchers/new">
              <Plus className="size-3" />
              {t('Pages.Vouchers.Actions.addBoost')}
            </Link>
          }
          role="link"
          size="sm"
          variant="outline"
        />
      ) : null}
      {draft ? (
        <VoucherLifecycleAction transition="publish" voucher={voucher} />
      ) : null}
      {voucher.status !== 'ARCHIVED' ? (
        <VoucherLifecycleAction transition="archive" voucher={voucher} />
      ) : null}
    </div>
  );
}
