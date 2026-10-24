import type { FormRecoveryDescriptor } from './types';

/**
 * Declares the recovery of a creation form, next to the schema of that form.
 * Returns the descriptor as it is: the call types it, and it is the one place
 * a reader looks to learn what a form keeps, omits and checks.
 *
 * `omit` is required, `[]` included: whoever adds a form must answer whether a
 * secret, a code entered once or a file is in it.
 */
export function defineFormRecovery<
  TValues extends object,
  TRefs = void,
  TExtra = never,
>(
  descriptor: FormRecoveryDescriptor<TValues, TRefs, TExtra>,
): FormRecoveryDescriptor<TValues, TRefs, TExtra> {
  return descriptor;
}
