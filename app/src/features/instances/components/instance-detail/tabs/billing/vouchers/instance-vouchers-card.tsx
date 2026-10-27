import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Redemption } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  RedemptionsCard,
  RevokeRedemptionDialog,
  useBillingCapabilities,
  useCanPerform,
} from '@/domains/billing';
import { dataModelIcons } from '@/lib/data-model-icons';
import { instanceVouchersQueryOptions } from '../../../../../queries';

const VoucherIcon = dataModelIcons.voucher;

type InstanceVouchersCardProps = {
  instanceSlug: string;
};

/**
 * What an instance redeemed, on its Billing tab: the voucher, when, the window it applies
 * in, how many invoices of a discount it has used, and its state; the way to apply a code
 * to the instance, and, for a session that may write vouchers, the way to take a
 * redemption back with the reason it is taken back for. A boost applies at once, a
 * discount to the invoices the instance is yet to be issued, and the card says so.
 *
 * Where the release has no vouchers, or the session may not read those of an instance,
 * there is no card.
 */
export function InstanceVouchersCard({
  instanceSlug,
}: InstanceVouchersCardProps) {
  const { t } = useTranslation();
  const featureOn = useBillingCapabilities().has('vouchers');
  const mayList = useCanPerform('instance.vouchers.list') && featureOn;
  const mayRedeem = useCanPerform('instance.vouchers.redeem') && featureOn;
  const mayRevoke = useCanPerform('vouchers.revoke');
  const mayReadVouchers = useCanPerform('vouchers.read');
  const [revoking, setRevoking] = useState<Redemption | null>(null);
  const redemptions = useQuery({
    ...instanceVouchersQueryOptions(instanceSlug),
    enabled: mayList,
  });

  if (!mayList) {
    return null;
  }

  return (
    <div data-testid="instance-vouchers">
      <RedemptionsCard
        actions={
          mayRedeem ? (
            <Button
              nativeButton={false}
              render={
                <Link
                  params={{ instanceSlug }}
                  to="/customers/instances/$instanceSlug/billing/redeem-voucher"
                >
                  <VoucherIcon className="size-4" />
                  {t('Pages.Customers.Instances.Detail.Billing.Vouchers.apply')}
                </Link>
              }
              role="link"
              size="sm"
            />
          ) : undefined
        }
        description={t(
          'Pages.Customers.Instances.Detail.Billing.Vouchers.description',
        )}
        emptyDescription={t(
          'Pages.Customers.Instances.Detail.Billing.Vouchers.empty',
        )}
        linksToVouchers={mayReadVouchers}
        onRevoke={mayRevoke ? setRevoking : undefined}
        query={redemptions}
        subject="voucher"
        testIdPrefix="instance-vouchers"
      />
      {revoking ? (
        <RevokeRedemptionDialog
          onClose={() => setRevoking(null)}
          redemption={revoking}
        />
      ) : null}
    </div>
  );
}
