import { Link, useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublishableKey, PublishableKeyCreated } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  getProblemCode,
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
import {
  REVOKED_REFUSAL,
  usePublishableKeyForm,
} from '../../hooks/use-publishable-key-form';
import {
  initialPublishableKeyFormValues,
  type PublishableKeyFormValues,
} from '../../schemas';
import { CreatedKeyView } from '../created/created-key-view';
import { LeaveWithoutKeyDialog } from '../created/leave-without-key-dialog';
import { PublishableKeyFields } from './publishable-key-fields';
import { publishableKeyRecovery } from './publishable-key-recovery';

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
  recovery,
}: PublishableKeyFormDialogProps & {
  onCreated: (created: PublishableKeyCreated) => void;
  recovery: FormRecovery<PublishableKeyFormValues>;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const navigate = useNavigate();
  const { failure, form } = usePublishableKeyForm({
    onCreated,
    onSaved: onClose,
    publishableKey,
    recovery: publishableKey ? undefined : recovery,
  });
  const { focusRef } = useFormRecoveryForm(recovery, form);
  // The secret is never kept: the offer says it is to be entered again.
  const omittedLabels = {
    turnstileSecret: t(`${BASE}.Form.Labels.turnstileSecret`),
  };

  // A deliberate abandon of an issue: the entries go, and a toast brings them back.
  const cancel = () => {
    if (!publishableKey) {
      recovery.discard({
        undo: () => void navigate({ to: '/integrations/publishable-keys/new' }),
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
            <FormRecoveryAlert fieldLabels={omittedLabels} recovery={recovery}>
              <PublishableKeyListLink />
            </FormRecoveryAlert>
            <FormRecoveryNotes fieldLabels={omittedLabels} recovery={recovery} />
            <PublishableKeyFields form={form} />
            {failure ? (
              <FormFailure
                failure={failure}
                onRetry={() => void form.handleSubmit()}
              />
            ) : null}
            <FormRecoverySubmitWarning recovery={recovery}>
              <PublishableKeyListLink />
            </FormRecoverySubmitWarning>
          </div>
        </StackedFormDialogPanel>
      </form.AppForm>
    </form>
  );
}

function PublishableKeyListLink() {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={<Link to="/integrations/publishable-keys" />}
      size="sm"
      variant="outline"
    >
      {t('Common.viewList')}
    </Button>
  );
}

/**
 * Why the API refused the form, above the buttons. A key that was revoked while its form
 * was open says so in words that tell what to do: a revoked key does not change, and a
 * new one takes its place. Any other refusal is the API's own words.
 */
function FormFailure({
  failure,
  onRetry,
}: {
  failure: unknown;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <ProblemAlert autoFocus error={failure} onRetry={onRetry} />
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
 * before the key was copied confirms. Changing a key edits its label, its origins and
 * its anonymous checkout (the switch, the Turnstile site key and secret), and is not
 * offered for a key that was revoked, which the API refuses to change.
 */
export function PublishableKeyFormDialog({
  onClose,
  publishableKey,
}: PublishableKeyFormDialogProps) {
  const access = useActionAccess(
    publishableKey ? 'publishableKeys.update' : 'publishableKeys.create',
  );

  // The dialog is opened by a link: for a session that may not write the keys the link
  // is inert, and a key that was revoked has nothing the API takes.
  useLeaveRestrictedDialog(access, onClose);
  if (!access.allowed || publishableKey?.revokedAt) {
    return null;
  }

  return (
    <PublishableKeyDialogContent
      onClose={onClose}
      publishableKey={publishableKey}
    />
  );
}

/**
 * The dialog of a session that may write the keys. What an issue typed and did not send
 * is offered back on the next visit, without the Turnstile secret; the change of a key
 * keeps nothing. The door freezes at its mount whether it is on, so it is opened once the
 * access is known, and the dialog opens once the device was read, so that its first
 * focus lands on the offer when there is one.
 */
function PublishableKeyDialogContent({
  onClose,
  publishableKey,
}: PublishableKeyFormDialogProps) {
  const { t } = useTranslation();
  const [created, setCreated] = useState<PublishableKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [askingToLeave, setAskingToLeave] = useState(false);
  const recovery = useFormRecovery(publishableKeyRecovery, {
    enabled: !publishableKey,
    pristine: initialPublishableKeyFormValues,
  });
  if (recovery.writer.status === 'reading') {
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
        initialFocus={recovery.offer ? recovery.focusOffer : undefined}
        onOpenChange={(open) => !open && dismiss()}
        open
        title={words.title}
      >
        <FormRecoveryAnnouncer recovery={recovery} />
        {created ? (
          <CreatedKeyView
            created={created}
            onCopied={() => setCopied(true)}
            onDone={onClose}
          />
        ) : (
          <PublishableKeyForm
            key={recovery.sessionKey}
            onClose={onClose}
            recovery={recovery}
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
