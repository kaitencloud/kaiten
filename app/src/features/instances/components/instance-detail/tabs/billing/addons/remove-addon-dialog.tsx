import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  type HeldAddon,
  isBilledInArrears,
} from '../../../../../utils/instance-addons.utils';

type RemoveAddonDialogProps = {
  /** Called once the person has confirmed: the change itself is the caller's. */
  onConfirm: () => void;
  onClose: () => void;
  row: HeldAddon;
};

/**
 * Asks before an add-on is taken off an instance. Its entitlements end at once, and
 * the confirmation says what that costs: the period under way is not refunded, and
 * the add-on is no longer billed from the next invoice. An add-on billed in arrears
 * is the exception it says too: its fee covers the period that ends at that invoice,
 * and is charged in full at the last quantity held.
 */
export function RemoveAddonDialog({
  onClose,
  onConfirm,
  row,
}: RemoveAddonDialogProps) {
  const { t } = useTranslation();
  const { name } = row.held;

  return (
    <AlertDialog onOpenChange={(open) => !open && onClose()} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Pages.Customers.Instances.Detail.Billing.Addons.Remove.title', {
              name,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Pages.Customers.Instances.Detail.Billing.Addons.Remove.description',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm" data-testid="remove-addon-billing">
          {t(
            isBilledInArrears(row.held)
              ? 'Pages.Customers.Instances.Detail.Billing.Addons.Remove.arrears'
              : 'Pages.Customers.Instances.Detail.Billing.Addons.Remove.refund',
          )}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <Button
            onClick={() => {
              onClose();
              onConfirm();
            }}
            type="button"
            variant="destructive"
          >
            {t(
              'Pages.Customers.Instances.Detail.Billing.Addons.Remove.confirm',
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
