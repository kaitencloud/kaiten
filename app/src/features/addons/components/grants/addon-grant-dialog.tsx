import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { AddonEntitlement, Entitlement } from '@/api-client';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useAddonGrantForm, useLicenseOverage } from '../../hooks';
import { AddonGrantFields } from './addon-grant-fields';

type AddonGrantDialogProps = {
  addonName: string;
  addonSlug: string;
  /** The grant being edited; a new one when left out. */
  grant?: AddonEntitlement;
  /** The entitlements the version does not grant yet: what a new grant can be for. */
  options: readonly Entitlement[];
  /** Closes the dialog: the tab drops the grant the URL opened it on. */
  onClose: () => void;
  /** The API refused because the version cannot be changed where it is. */
  onFrozen: (error: unknown) => void;
};

function GrantForm({
  addonSlug,
  grant,
  onClose,
  onFrozen,
  options,
}: Omit<AddonGrantDialogProps, 'addonName'>) {
  const { t } = useTranslation();
  const formId = useId();
  const licenseOverage = useLicenseOverage(addonSlug);
  const { failure, form, isEditing } = useAddonGrantForm({
    addonSlug,
    grant,
    onDone: onClose,
    onFrozen,
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
            label={t(
              isEditing
                ? 'Pages.Addons.Grants.Form.update'
                : 'Pages.Addons.Grants.Form.create',
            )}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-6">
            <AddonGrantFields
              form={form}
              isEditing={isEditing}
              licenseOverage={licenseOverage}
              options={options}
            />
            {failure ? <ProblemAlert autoFocus error={failure} /> : null}
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

/**
 * The dialog a grant is added or edited in, which the URL opens (`?grant=new`,
 * `?grant=<entitlement>`) so that it can be linked to and the back button closes it.
 * It is the form of one grant and leaves the tab under it as it was.
 */
export function AddonGrantDialog({
  addonName,
  grant,
  ...props
}: AddonGrantDialogProps) {
  const { t } = useTranslation();

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={t('Pages.Addons.Grants.Form.description', {
        name: addonName,
      })}
      onOpenChange={(open) => !open && props.onClose()}
      open
      title={t(
        grant
          ? 'Pages.Addons.Grants.Form.titleEdit'
          : 'Pages.Addons.Grants.Form.titleNew',
      )}
    >
      <GrantForm grant={grant} {...props} />
    </StackedFormDialog>
  );
}
