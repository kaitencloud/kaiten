import { Link, useNavigate } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Addon, AddonFamily } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  ProblemAlert,
  useActionAccess,
  useLeaveRestrictedDialog,
} from '@/domains/billing';
import {
  type FormRecovery,
  FormRecoveryAlert,
  FormRecoveryAnnouncer,
  FormRecoveryNotes,
  FormRecoverySubmitWarning,
  useFormRecovery,
  useFormRecoveryForm,
} from '@/functionals/form-recovery';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import { useAddonForm } from '../../hooks/use-addon-form';
import { type AddonFormValues, initialAddonFormValues } from '../../schemas';
import { getFamilyHead } from '../../utils/addon-families.utils';
import { AddonFormFields, type AddonFormMode } from './addon-form-fields';
import { addonRecovery } from './addon-recovery';

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
  recovery,
}: AddonFormDialogProps & {
  mode: AddonFormMode;
  recovery: FormRecovery<AddonFormValues>;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const navigate = useNavigate();
  const { failure, form } = useAddonForm({
    addon,
    base: family ? getFamilyHead(family) : undefined,
    familySlug: family?.slug,
    onSaved,
    recovery: mode === 'edit' ? undefined : recovery,
  });
  const { focusRef } = useFormRecoveryForm(recovery, form);

  // A deliberate abandon of a creation: the entries go, and a toast brings them back.
  const cancel = () => {
    if (mode !== 'edit') {
      recovery.discard({
        undo: () =>
          void navigate({
            search: family ? { family: family.slug } : {},
            to: '/catalog/addons/new',
          }),
      });
    }
    onClose();
  };

  return (
    <form
      id={formId}
      ref={focusRef}
      onSubmit={createFormSubmitHandler(form.handleSubmit)}
    >
      <form.AppForm>
        <StackedFormDialogFooter>
          <Button onClick={cancel} type="button" variant="outline">
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
            <FormRecoveryAlert recovery={recovery}>
              <AddonListLink />
            </FormRecoveryAlert>
            <FormRecoveryNotes recovery={recovery} />
            <AddonFormFields form={form} mode={mode} />
            {failure ? (
              <ProblemAlert
                autoFocus
                error={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
            <FormRecoverySubmitWarning recovery={recovery}>
              <AddonListLink />
            </FormRecoverySubmitWarning>
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

function AddonListLink() {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={<Link to="/catalog/addons" />}
      size="sm"
      variant="outline"
    >
      {t('Common.viewList')}
    </Button>
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
 * family (`/catalog/addons/new`), the next version of one (`/catalog/addons/new?family=<slug>`) or the
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
  const create = useActionAccess('addons.create');
  const mode: AddonFormMode = addon ? 'edit' : family ? 'version' : 'family';
  const text = getDialogText(t, mode, { addon, family });

  // The dialog is opened by a link (`?mode=configure`, `/new`) and by its address: for a
  // session that may not write add-ons the link is inert and there is no dialog to open.
  const access = mode === 'edit' ? update : create;
  useLeaveRestrictedDialog(access, onClose);
  if (!access.allowed) {
    return null;
  }

  return (
    <AddonFormDialogContent
      addon={addon}
      family={family}
      mode={mode}
      onClose={onClose}
      onSaved={onSaved}
      text={text}
    />
  );
}

/**
 * The dialog of a session that may write add-ons. What a creation typed and did not
 * send is offered back on the next visit, for the same family; the edit of a version
 * keeps nothing. The door freezes at its mount whether it is on, so it is opened once
 * the access is known, and the dialog opens once the device was read, so that its
 * first focus lands on the offer when there is one.
 */
function AddonFormDialogContent({
  addon,
  family,
  mode,
  onClose,
  onSaved,
  text,
}: AddonFormDialogProps & {
  mode: AddonFormMode;
  text: { description: string; title: string };
}) {
  const recovery = useFormRecovery(addonRecovery, {
    context: family ? `family:${family.slug}` : '',
    enabled: mode !== 'edit',
    pristine: initialAddonFormValues(family ? getFamilyHead(family) : undefined),
  });
  if (recovery.writer.status === 'reading') {
    return null;
  }

  return (
    <StackedFormDialog
      confirmOnClose={false}
      description={text.description}
      initialFocus={recovery.offer ? recovery.focusOffer : undefined}
      onOpenChange={(open) => !open && onClose()}
      open
      title={text.title}
    >
      <FormRecoveryAnnouncer recovery={recovery} />
      <AddonForm
        key={recovery.sessionKey}
        addon={addon}
        family={family}
        mode={mode}
        onClose={onClose}
        onSaved={onSaved}
        recovery={recovery}
      />
    </StackedFormDialog>
  );
}
