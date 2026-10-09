import { useTranslation } from 'react-i18next';
import { StackedFormDialog } from '@/functionals/stacked-form-dialog';
import { useRedeemVoucher } from '../../../../../hooks/use-redeem-voucher';
import { useInstanceDetail } from '../../../instance-detail-context';
import { RedeemVoucherForm } from './redeem-voucher-form';

type RedeemVoucherDialogProps = {
  /** Called when the dialog is closed: the route leads back to the tab. */
  onClose: () => void;
};

/**
 * The dialog that applies a voucher code to an instance, a route of its own over the
 * Billing tab (`/billing/redeem-voucher`): closing it leads back to the tab, and a link
 * to it opens it. The code is typed in the dialog and is not part of the address. It is
 * titled by the step it is on: the code being checked, then what the redemption did.
 */
export function RedeemVoucherDialog({ onClose }: RedeemVoucherDialogProps) {
  const { t } = useTranslation();
  const { instance } = useInstanceDetail();
  const redeem = useRedeemVoucher(instance.slug ?? instance.id);
  const base = 'Pages.Customers.Instances.Detail.Billing.Vouchers.Redeem';

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t(
        redeem.outcome ? `${base}.doneDescription` : `${base}.description`,
      )}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
      title={t(redeem.outcome ? `${base}.doneTitle` : `${base}.title`, {
        name: instance.name,
      })}
    >
      <RedeemVoucherForm onClose={onClose} redeem={redeem} />
    </StackedFormDialog>
  );
}
