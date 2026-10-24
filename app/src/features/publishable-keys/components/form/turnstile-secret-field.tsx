import { useStore } from '@tanstack/react-form';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { clearProblemFieldError } from '@/domains/billing';
import { withForm } from '@/hooks/form';
import type { TurnstileSecretAction } from '../../utils/turnstile';
import { publishableKeyFormOpts } from '../../schemas';

const BASE = 'Pages.Integrations.PublishableKeys.Form';

type TurnstileSecretFieldProps = {
  /** The deployment has no Vault to store a secret in, so none can be given. */
  vaultMissing: boolean;
};

/**
 * The Turnstile secret, which the API stores in Vault and never gives back. A key with no
 * secret shows a password field, empty. A key that has one shows only that it does, with
 * "Replace" (a field to type the new one in, and a way back) and "Remove" (taken away
 * when the form is saved, and a way back): what is stored is never read, so there is
 * nothing to prefill. A deployment without Vault disables the field and says why.
 */
export const TurnstileSecretField = withForm({
  ...publishableKeyFormOpts,
  props: {} as TurnstileSecretFieldProps,
  render: function TurnstileSecretFieldRender({ form, vaultMissing }) {
    const { t } = useTranslation();
    const labelId = useId();
    const action = useStore(
      form.store,
      (state) => state.values.turnstileSecretAction,
    );
    const onFile = useStore(
      form.store,
      (state) => state.values.turnstileSecretOnFile,
    );
    const anonymousCheckout = useStore(
      form.store,
      (state) => state.values.anonymousCheckout,
    );
    const block = useRef<HTMLDivElement>(null);
    // Set by the buttons below, taken by the effect that follows the state they change.
    const focusAfterChange = useRef(false);

    // The button pressed leaves with the state it belonged to, and the focus would fall
    // to the page: it goes to the first control of the state that replaces it. Only when
    // a button asked for it, never when the field is drawn (an effect runs twice at
    // mount in StrictMode, and the first draw is not the person's doing).
    useEffect(() => {
      if (focusAfterChange.current) {
        focusAfterChange.current = false;
        block.current?.querySelector<HTMLElement>('input, button')?.focus();
      }
    }, [action]);

    const choose = (next: TurnstileSecretAction) => {
      focusAfterChange.current = true;
      form.setFieldValue('turnstileSecretAction', next);
      form.setFieldValue('turnstileSecret', '');
      // What the API refused of the switch was about the secret as it stood.
      clearProblemFieldError(form, 'anonymousCheckout');
    };


    if (action === 'set') {
      return (
        <div className="space-y-2" ref={block}>
          <form.AppField name="turnstileSecret">
            {(field) => (
              <field.TextField
                description={
                  vaultMissing
                    ? t(`${BASE}.Descriptions.vaultMissing`)
                    : t(`${BASE}.Descriptions.turnstileSecret`)
                }
                disabled={vaultMissing}
                label={t(`${BASE}.Labels.turnstileSecret`)}
                required={onFile || anonymousCheckout}
                type="password"
              />
            )}
          </form.AppField>
          {onFile ? (
            <Button
              onClick={() => choose('keep')}
              size="sm"
              type="button"
              variant="outline"
            >
              {t(`${BASE}.Secret.keep`)}
            </Button>
          ) : null}
        </div>
      );
    }

    return (
      <div aria-labelledby={labelId} className="space-y-2" role="group">
        <span className="text-sm leading-none font-medium" id={labelId}>
          {t(`${BASE}.Labels.turnstileSecret`)}
        </span>
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
          ref={block}
        >
          <p
            className="text-sm text-muted-foreground"
            data-testid="turnstile-secret-status"
          >
            {action === 'keep'
              ? t(`${BASE}.Secret.stored`)
              : // With the checkout still on, the switch says why it cannot be saved.
                t(`${BASE}.Secret.removing`)}
          </p>
          <div className="flex gap-2">
            {action === 'keep' ? (
              <>
                <Button
                  disabled={vaultMissing}
                  onClick={() => choose('set')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t(`${BASE}.Secret.replace`)}
                </Button>
                <Button
                  onClick={() => choose('remove')}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t(`${BASE}.Secret.remove`)}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => choose('keep')}
                size="sm"
                type="button"
                variant="outline"
              >
                {t(`${BASE}.Secret.undo`)}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  },
});
