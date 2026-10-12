import type { TFunction } from 'i18next';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey, PublishableKeyCreated } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  getProblemCode,
  ProblemAlert,
  useActionAccess,
} from '@/domains/billing';
import {
  StackedFormDialog,
  StackedFormDialogFooter,
  StackedFormDialogPanel,
} from '@/functionals/stacked-form-dialog';
import { createFormSubmitHandler } from '@/hooks/form';
import {
  REVOKED_REFUSAL,
  usePublishableKeyForm,
} from '../../hooks/use-publishable-key-form';
import { CreatedKeyView } from '../created/created-key-view';
import { LeaveWithoutKeyDialog } from '../created/leave-without-key-dialog';
import { PublishableKeyFields } from './publishable-key-fields';

const BASE = 'Pages.Integrations.PublishableKeys';

type PublishableKeyFormDialogProps = {
  /** Closes the dialog: the route leads back to the list under it. */
  onClose: () => void;
  /** The key to change; without one the dialog issues a new key. */
  publishableKey?: PublishableKey;
};

function PublishableKeyForm({
  onClose,
  onCreated,
  publishableKey,
}: PublishableKeyFormDialogProps & {
  onCreated: (created: PublishableKeyCreated) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const { failure, form } = usePublishableKeyForm({
    onCreated,
    onSaved: onClose,
    publishableKey,
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
            label={
              publishableKey
                ? t(`${BASE}.Edit.save`)
                : t(`${BASE}.Create.submit`)
            }
          />
        </StackedFormDialogFooter>
        <StackedFormDialogPanel>
          <div className="space-y-6">
            <PublishableKeyFields form={form} />
            {failure ? <FormFailure failure={failure} /> : null}
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

/**
 * Why the API refused the form, above the buttons. A key that was revoked while its form
 * was open says so in words that tell what to do: a revoked key does not change, and a
 * new one takes its place. Any other refusal is the API's own words.
 */
function FormFailure({ failure }: { failure: unknown }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <ProblemAlert autoFocus error={failure} />
      {getProblemCode(failure) === REVOKED_REFUSAL ? (
        <p className="text-sm text-muted-foreground" data-testid="revoked-hint">
          {t('Pages.Integrations.PublishableKeys.Edit.revoked')}
        </p>
      ) : null}
    </div>
  );
}

/** What the dialog says of itself: issuing a key, the key it ended on, or changing one. */
function getDialogWords(
  t: TFunction,
  publishableKey: PublishableKey | undefined,
  hasCreated: boolean,
) {
  if (hasCreated) {
    return {
      description: t(`${BASE}.Create.Created.description`),
      title: t(`${BASE}.Create.Created.title`),
    };
  }
  if (publishableKey) {
    return {
      description: t(`${BASE}.Edit.description`),
      title: t(`${BASE}.Edit.title`, { label: publishableKey.label }),
    };
  }

  return {
    description: t(`${BASE}.Create.description`),
    title: t(`${BASE}.Create.title`),
  };
}

/**
 * The dialog a publishable key is issued or changed in, which the URL opens. Issuing one
 * ends on the key itself, once, with a way to copy it and the warning that it will not be
 * shown again; closing the dialog from there is leaving it for good, which a dismissal
 * before the key was copied confirms. Changing a key edits
 * its label and its origins and nothing else, and is not offered for a key that was
 * revoked, which the API refuses to change.
 */
export function PublishableKeyFormDialog({
  onClose,
  publishableKey,
}: PublishableKeyFormDialogProps) {
  const { t } = useTranslation();
  const access = useActionAccess(
    publishableKey ? 'publishableKeys.update' : 'publishableKeys.create',
  );
  const [created, setCreated] = useState<PublishableKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [askingToLeave, setAskingToLeave] = useState(false);

  // The dialog is opened by a link: for a session that may not write the keys the link
  // is inert, and a key that was revoked has nothing the API takes.
  if (!access.allowed || publishableKey?.revokedAt) {
    return null;
  }

  const words = getDialogWords(t, publishableKey, created !== null);

  // Dismissing the dialog (Escape, a click outside, the close button) while the key is
  // the only copy and was not copied asks first; the Done button is a decision, not a
  // gesture, and closes at once.
  function dismiss() {
    if (created && !copied) {
      setAskingToLeave(true);
      return;
    }
    onClose();
  }

  return (
    <>
      <StackedFormDialog
        confirmOnClose={false}
        description={words.description}
        onOpenChange={(open) => !open && dismiss()}
        open
        title={words.title}
      >
        {created ? (
          <CreatedKeyView
            created={created}
            onCopied={() => setCopied(true)}
            onDone={onClose}
          />
        ) : (
          <PublishableKeyForm
            onClose={onClose}
            onCreated={setCreated}
            publishableKey={publishableKey}
          />
        )}
      </StackedFormDialog>
      <LeaveWithoutKeyDialog
        onLeave={onClose}
        onOpenChange={setAskingToLeave}
        open={askingToLeave}
      />
    </>
  );
}
