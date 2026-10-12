import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  ProblemAlert,
  useActionAccess,
  useBillingCapabilities,
} from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { LicenseCommercialFields } from './license-commercial-fields';
import { useLicenseCommercialForm } from './use-license-commercial-form';

type LicenseCommercialDialogProps = {
  license: License;
  /** Closes the dialog: the route drops the mode it was opened by. */
  onClose: () => void;
};

function CommercialForm({ license, onClose }: LicenseCommercialDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { failure, form } = useLicenseCommercialForm({
    license,
    onDone: onClose,
  });

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            form={formId}
            label={t('Pages.Licenses.Commercial.Form.save')}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-6">
            <LicenseCommercialFields form={form} />
            {failure ? <ProblemAlert error={failure} /> : null}
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

/**
 * The dialog the commercial fields of a version are edited in, which the URL
 * opens (`?mode=configure`) like the other edit dialogs of the console. The
 * fields are billing's: where billing is not there, or the session may not write
 * licenses, there is no dialog to open, and the link is inert.
 */
export function LicenseCommercialDialog({
  license,
  onClose,
}: LicenseCommercialDialogProps) {
  const { t } = useTranslation();
  const { isEnabled } = useBillingCapabilities();
  const { allowed } = useActionAccess('license.updateCommercialFields');

  if (!isEnabled || !allowed) {
    return null;
  }

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t('Pages.Licenses.Commercial.dialogDescription', {
        name: license.name,
        version: license.version,
      })}
      finalFocus={() => {
        // The dialog opens from a link of the page behind it, which the
        // navigation that closes it renders again.
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLAnchorElement>('[data-commercial-edit]')
            ?.focus(),
        );

        return false;
      }}
      onOpenChange={(open) => !open && onClose()}
      open
      title={t('Pages.Licenses.Commercial.dialogTitle')}
    >
      <CommercialForm license={license} onClose={onClose} />
    </StackedFormDialog>
  );
}
