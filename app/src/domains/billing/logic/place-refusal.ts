import type { AnyFormApi } from '@tanstack/react-form';
import { handleBillingProblem } from './billing-problem';
import {
  applyProblemFieldErrors,
  setProblemFieldError,
} from './problem-field-errors';

/** Which field of a form a refusal of the API is about. */
export type RefusalFields = {
  /**
   * By the code of the refusal: for the ones that say the field in prose and do
   * not locate it, such as a reference that is too long.
   */
  byCode?: Readonly<Record<string, string>>;
  /** By the location the problem gives its errors (`body.externalReference`). */
  byLocation?: Readonly<Record<string, string>>;
};

/**
 * Shows a refusal of the API on the field it is about, where the person is
 * looking, with the API's own message. Returns whether it did: when it did not,
 * the refusal is shown above the buttons instead.
 */
export function placeRefusalOnFields(
  form: AnyFormApi,
  error: unknown,
  { byCode = {}, byLocation = {} }: RefusalFields = {},
): boolean {
  const problem = handleBillingProblem(error);
  const field = problem.code ? byCode[problem.code] : undefined;

  if (field && problem.detail) {
    setProblemFieldError(form, field, problem.detail);

    return true;
  }

  return applyProblemFieldErrors(form, problem, byLocation);
}
