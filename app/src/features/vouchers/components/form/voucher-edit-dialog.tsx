import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Voucher } from '@/api-client';
import { Button } from '@/components/ui/button';
import { ProblemAlert, useActionAccess } from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useVoucherEditForm } from '../../hooks/use-voucher-edit-form';
import { VoucherEditFields } from './voucher-edit-fields';

type VoucherEditDialogProps = {
  /** Closes the dialog: the route leads back to the page under it. */
  onClose: () => void;
  voucher: Voucher;
};

function VoucherEditForm({ onClose, voucher }: VoucherEditDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { failure, form } = useVoucherEditForm({ onSaved: onClose, voucher });

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            form={formId}
            label={t('Pages.Vouchers.Edit.save')}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-6">
            <VoucherEditFields form={form} voucher={voucher} />
            {failure ? <ProblemAlert autoFocus error={failure} /> : null}
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

/**
 * The dialog a published voucher is changed in, which the URL opens (`?mode=configure`
 * on its page). The API lets four things change once a voucher is published: its name, its
 * description, the end of its window and the most it can be redeemed; the dialog says so,
 * and what it sends restates everything else as it is stored.
 */
export function VoucherEditDialog({
  onClose,
  voucher,
}: VoucherEditDialogProps) {
  const { t } = useTranslation();
  const update = useActionAccess('vouchers.update');

  // The edit is opened by a link: for a session that may not write vouchers the link is
  // inert, and for a voucher that is not published there is nothing the API takes.
  if (!update.allowed || voucher.status !== 'ACTIVE') {
    return null;
  }

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t('Pages.Vouchers.Edit.description')}
      onOpenChange={(open) => !open && onClose()}
      open
      title={t('Pages.Vouchers.Edit.title', { name: voucher.name })}
    >
      <VoucherEditForm onClose={onClose} voucher={voucher} />
    </StackedFormDialog>
  );
}
