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

// What each form has put on each of its fields, to take it back: a field has one
// refusal at a time, and a newer one replaces the older.
const shownRefusals = new WeakMap<AnyFormApi, Map<string, () => void>>();

const sameValue = (left: unknown, right: unknown) =>
  Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

/**
 * Shows an error of the API as the error of one field of a form, and marks the
 * field touched so that it is read. The message is shown as it is. For a refusal
 * whose field the caller knows already: `applyProblemFieldErrors` is the one for
 * a problem that locates its own. `extra` is what else the error carries (the code
 * of the refusal, for what is shown beside the field to read), next to its message.
 *
 * The refusal is about what was typed, so it goes when that changes, as the checks
 * of the form do: the field is no longer wrong by what the API said, and a form that
 * stayed invalid after the person fixed it would not let them send it again. It stays
 * while the value does not change, even if the field is taken off the screen and drawn
 * again, which starts its state over.
 */
export function setProblemFieldError(
  form: AnyFormApi,
  field: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  const shownFor = form.getFieldValue(field);
  const shown = shownRefusals.get(form) ?? new Map<string, () => void>();
  shownRefusals.set(form, shown);
  shown.get(field)?.();

  const show = () =>
    form.setFieldMeta(field, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: { ...extra, message } },
      isTouched: true,
    }));
  show();

  const subscription = form.store.subscribe(() => {
    if (sameValue(form.getFieldValue(field), shownFor)) {
      // A field that is taken off the screen and drawn again, as the step of a wizard is,
      // starts over, and its state with it: what the API said of what is typed still
      // stands, so it is put back.
      if (!form.getFieldMeta(field)?.errorMap?.onServer) {
        show();
      }

      return;
    }
    forget();
    form.setFieldMeta(field, (meta) => ({
      ...meta,
      errorMap: { ...meta.errorMap, onServer: undefined },
    }));
  });
  function forget() {
    subscription.unsubscribe();
    shown.delete(field);
  }
  shown.set(field, forget);
}

/**
 * Takes a refusal of the API off a field before what was typed on it changes: for a
 * refusal that is about what several fields say together (a short code with nothing to
 * bound it), where fixing it means changing another field, which the refusal of the
 * first does not know. It does nothing for a field that has none.
 */
export function clearProblemFieldError(form: AnyFormApi, field: string) {
  shownRefusals.get(form)?.get(field)?.();
  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: { ...meta.errorMap, onServer: undefined },
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
