import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, AddonFamily } from '@/api-client';
import { Button } from '@/components/ui/button';
import { ProblemAlert, useActionAccess } from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useAddonForm } from '../../hooks/use-addon-form';
import { getFamilyHead } from '../../utils/addon-families.utils';
import { AddonFormFields, type AddonFormMode } from './addon-form-fields';

type AddonFormDialogProps = {
  /** The version being edited; a new one when left out. */
  addon?: Addon;
  /** The family a new version joins; a new family when left out. */
  family?: AddonFamily;
  /** Closes the dialog: the route leads back to the page under it. */
  onClose: () => void;
  /** Called once the API accepted the version, with what it answered. */
  onSaved: (saved: Addon) => void;
};

function AddonForm({
  addon,
  family,
  mode,
  onClose,
  onSaved,
}: AddonFormDialogProps & { mode: AddonFormMode }) {
  const { t } = useTranslation();
  const formId = useId();
  const { failure, form } = useAddonForm({
    addon,
    base: family ? getFamilyHead(family) : undefined,
    familySlug: family?.slug,
    onSaved,
  });

  return (
    <form id={formId} onSubmit={createFormSubmitHandler(form.handleSubmit)}>
      <form.AppForm>
        <StackedFormDialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            {t('Common.cancel')}
          </Button>
          <form.SubmitButton
            allowPristine={mode !== 'edit'}
            form={formId}
            label={t(
              mode === 'edit'
                ? 'Pages.Addons.Form.updateButton'
                : 'Pages.Addons.Form.createButton',
            )}
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-6">
            <AddonFormFields form={form} mode={mode} />
            {failure ? <ProblemAlert autoFocus error={failure} /> : null}
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

// What the dialog is called and says of itself, by what it is for.
function getDialogText(
  t: Translate,
  mode: AddonFormMode,
  { addon, family }: Pick<AddonFormDialogProps, 'addon' | 'family'>,
) {
  switch (mode) {
    case 'edit':
      return {
        description: t('Pages.Addons.Form.descriptionEdit', {
          name: addon?.name,
          version: addon?.version,
        }),
        title: t('Pages.Addons.Form.titleUpdate'),
      };
    case 'version':
      return {
        description: t('Pages.Addons.Form.descriptionNewVersion'),
        title: t('Pages.Addons.Form.titleNewVersion', {
          name: family ? (getFamilyHead(family)?.name ?? family.slug) : '',
        }),
      };
    case 'family':
      return {
        description: t('Pages.Addons.Form.descriptionNew'),
        title: t('Pages.Addons.Form.titleNew'),
      };
  }
}

/**
 * The dialog an add-on version is created or edited in, which the URL opens: a new
 * family (`/addons/new`), the next version of one (`/addons/new?family=<slug>`) or the
 * edit of a version (`?mode=configure` on its page). A new version starts from
 * nothing the previous one had: the API copies no grant, no price and no license, and
 * the dialog says so.
 */
export function AddonFormDialog({
  addon,
  family,
  onClose,
  onSaved,
}: AddonFormDialogProps) {
  const { t } = useTranslation();
  const update = useActionAccess('addons.update');
  const mode: AddonFormMode = addon ? 'edit' : family ? 'version' : 'family';
  const text = getDialogText(t, mode, { addon, family });

  // The edit is opened by a link (`?mode=configure`): for a session that may not
  // write add-ons the link is inert and there is no dialog to open.
  if (mode === 'edit' && !update.allowed) {
    return null;
  }

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={text.description}
      onOpenChange={(open) => !open && onClose()}
      open
      title={text.title}
    >
      <AddonForm
        addon={addon}
        family={family}
        mode={mode}
        onClose={onClose}
        onSaved={onSaved}
      />
    </StackedFormDialog>
  );
}
