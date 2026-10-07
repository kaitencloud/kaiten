import type { AnyFormApi } from '@tanstack/react-form';
import type { BillingProblem } from './billing-problem';

/**
 * How a refusal of the API reaches the fields of a form. The message is the API's
 * own and is shown as it is; where it goes is the caller's to say, by the field
 * (`setProblemFieldError`) or by the location the problem names
 * (`applyProblemFieldErrors`).
 */

// `body.billingEmail`, `path.invoiceId`: the part of the request an error is
// about, which a form field is named without.
const LOCATION_PREFIX = /^(?:body|path|query|header)\./;

function fieldFor(
  location: string | undefined,
  fieldsByLocation: Record<string, string>,
): string | undefined {
  if (!location) {
    return undefined;
  }

  for (const candidate of [location, location.replace(LOCATION_PREFIX, '')]) {
    let best: string | undefined;
    for (const key of Object.keys(fieldsByLocation)) {
      const covers =
        candidate === key ||
        candidate.startsWith(`${key}.`) ||
        candidate.startsWith(`${key}[`);
      if (covers && (best === undefined || key.length > best.length)) {
        best = key;
      }
    }
    if (best !== undefined) {
      return fieldsByLocation[best];
    }
  }

  return undefined;
}

/**
 * Shows an error of the API as the error of one field of a form, and marks the
 * field touched so that it is read. The message is shown as it is. For a refusal
 * whose field the caller knows already: `applyProblemFieldErrors` is the one for
 * a problem that locates its own. `extra` is what else the error carries (the code
 * of the refusal, for what is shown beside the field to read), next to its message.
 */
export function setProblemFieldError(
  form: AnyFormApi,
  field: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: { ...meta.errorMap, onServer: { ...extra, message } },
    isTouched: true,
  }));
}

/**
 * Puts the field errors of a 422 on the form's fields: `errors[].location` of
 * the problem (`body.externalReference`, `body.sampleUsage[0].value`) goes to
 * the field `fieldsByLocation` names for it, keyed with or without the `body.`
 * prefix, the longest key winning. The message is the API's own, shown as it is.
 *
 * Returns whether every error of the problem found a field that is on screen (and
 * there was one). When it did not, show the problem's `detail` in a
 * `ProblemAlert`.
 */
export function applyProblemFieldErrors(
  form: AnyFormApi,
  problem: BillingProblem | null | undefined,
  fieldsByLocation: Record<string, string>,
): boolean {
  if (!problem || problem.errors.length === 0) {
    return false;
  }

  let placed = 0;
  for (const error of problem.errors) {
    const field = fieldFor(error.location, fieldsByLocation);
    // A field that is not on screen has nowhere to show its message.
    if (field === undefined || !form.getFieldMeta(field)) {
      continue;
    }
    placed += 1;
    setProblemFieldError(form, field, error.message ?? problem.detail ?? '');
  }

  return placed === problem.errors.length;
}
