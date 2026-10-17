import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Redemption, Voucher } from '@/api-client';
import {
  RedemptionsCard,
  RevokeRedemptionDialog,
  useCanPerform,
} from '@/domains/billing';
import { voucherRedemptionsQueryOptions } from '../../queries';

type VoucherRedemptionsCardProps = {
  voucher: Pick<Voucher, 'id'>;
};

/**
 * What was redeemed of the voucher: the instance, when, the window it applies in, how many
 * invoices of a discount it has used, and its state. A redemption that still applies can be
 * taken back, with the reason it is taken back for, by a session that may write vouchers.
 * Reading them is a scope of its own: without it the card is not there, and the rest of
 * the page is.
 */
export function VoucherRedemptionsCard({
  voucher,
}: VoucherRedemptionsCardProps) {
  const { t } = useTranslation();
  const mayRead = useCanPerform('vouchers.redemptions');
  const mayRevoke = useCanPerform('vouchers.revoke');
  const [revoking, setRevoking] = useState<Redemption | null>(null);
  const redemptions = useQuery({
    ...voucherRedemptionsQueryOptions(voucher.id),
    enabled: mayRead,
  });

  if (!mayRead) {
    return null;
  }

  return (
    <>
      <RedemptionsCard
        description={t('Pages.Vouchers.Detail.Redemptions.description')}
        emptyDescription={t('Pages.Vouchers.Detail.Redemptions.empty')}
        onRevoke={mayRevoke ? setRevoking : undefined}
        query={redemptions}
        subject="instance"
        testIdPrefix="voucher-redemptions"
      />
      {revoking ? (
        <RevokeRedemptionDialog
          onClose={() => setRevoking(null)}
          redemption={revoking}
        />
      ) : null}
    </>
  );
}
