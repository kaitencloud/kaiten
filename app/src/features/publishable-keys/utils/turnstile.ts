/**
 * What the form of a key does with the Turnstile secret, which the API never gives back:
 * - `keep`: the secret stored for the key stays as it is (only a key that has one);
 * - `set`: the person types one, to store it, or to replace the stored one;
 * - `remove`: the stored secret is deleted when the form is saved.
 */
export type TurnstileSecretAction = 'keep' | 'remove' | 'set';

/** The members of the form that decide whether the key can open the anonymous checkout. */
export type TurnstileFormState = {
  turnstileSecret: string;
  turnstileSecretAction: TurnstileSecretAction;
  turnstileSiteKey: string;
};

/** Whether a site key is given: blanks are none. */
export const hasSiteKey = ({ turnstileSiteKey }: TurnstileFormState) =>
  turnstileSiteKey.trim() !== '';

/**
 * Whether the key holds a secret once the form is saved: the stored one it keeps, or the
 * one being typed. A secret removed, or an empty field, is none.
 */
export const hasSecretAfterSave = ({
  turnstileSecret,
  turnstileSecretAction,
}: TurnstileFormState) =>
  turnstileSecretAction === 'keep' ||
  (turnstileSecretAction === 'set' && turnstileSecret.trim() !== '');

/**
 * Whether the anonymous checkout can be on: the API refuses a key that opens it without
 * both a site key and a secret (`.TurnstileNotConfigured`), so the form does not offer
 * the switch until the key will hold both.
 */
export const canOpenAnonymousCheckout = (state: TurnstileFormState) =>
  hasSiteKey(state) && hasSecretAfterSave(state);
