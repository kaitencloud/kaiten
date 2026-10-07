import type { AnyFormApi } from '@tanstack/react-form';
import type { ErrorDetail, Problem } from '@/api-client';
import {
  getErrorMessage,
  isApiError,
  isProblem,
  mapApiError,
} from '@/lib/errors';

/**
 * How the console reads what billing refuses with. The API answers a problem
 * document with a stable `code` (`SubscribeInstance.StartAtTooEarly`) and a
 * `detail` in its own words. The console shows the `detail` and keeps no
 * translation per code: only the few codes below, which change what a screen
 * does and not just what it says, are recognised.
 */

export type BillingProblemKind =
  /** 403 `Billing.Disabled` or `Billing.NotEntitled`: billing is off, not broken. */
  | 'unavailable'
  /** 403 `Auth.MissingScope`: the token lacks the scope the action needs. */
  | 'missing-scope'
  /** 503: nothing was changed, and asking again may work. */
  | 'transient'
  /** 409 `*.BoundaryPending`: the period is closing; try again after `retryAfterMs`. */
  | 'boundary-pending'
  /** 422 `*.OutsideRetention`: the usage asked for is no longer kept. */
  | 'outside-retention'
  /** Anything else: the `detail` says it. */
  | 'generic';

export type BillingProblem = {
  kind: BillingProblemKind;
  /** The stable machine-readable code, when the API sent a problem document. */
  code?: string;
  /**
   * The API's explanation, to show as it is. Absent when a problem document came
   * back without one: the title ("Unprocessable Entity") explains nothing, so a
   * screen shows its generic text and the `code`. A failure that is not a
   * problem document carries a message of the console's own instead: the one of
   * its status, or of the network. What a gateway answered with (a plain text or
   * an HTML page) is never shown.
   */
  detail?: string;
  /** Per-field details (`errors` of the problem), never null. */
  errors: ErrorDetail[];
  /** The HTTP status, absent when no response came back. */
  status?: number;
  title?: string;
  /** The correlation id of the server-side log entry (`errorId`). */
  traceId?: string;
  /** For `unavailable`: which of the two it is. */
  unavailableReason?: 'DEPLOYMENT_DISABLED' | 'NOT_ENTITLED';
  /** For `missing-scope`: the scope the API names. */
  missingScope?: string;
  /** For `transient`: the payment provider is the one that cannot be reached. */
  providerUnavailable?: boolean;
  /** For `boundary-pending`: how long to wait before the one retry. */
  retryAfterMs?: number;
  /** For `outside-retention`: where the usage that is kept begins. */
  retentionStart?: string;
};

/** The wait when a boundary refusal carries no `Retry-After`, which is today's API. */
export const DEFAULT_RETRY_AFTER_MS = 60_000;
const MAX_RETRY_AFTER_MS = 5 * 60_000;

/** The problem document a failure carries, from an `ApiError` or a bare body. */
export function getProblem(error: unknown): Problem | undefined {
  if (isApiError(error)) {
    return isProblem(error.data) ? error.data : undefined;
  }

  return isProblem(error) ? error : undefined;
}

export function getProblemCode(error: unknown): string | undefined {
  return getProblem(error)?.code;
}

function parseRetryAfter(header: string | null | undefined, now: number) {
  const value = header?.trim();
  if (!value) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const date = Date.parse(value);

  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * How long to wait before retrying, from the `Retry-After` header of the
 * response (seconds, or an HTTP date), and a minute when it has none: the stack
 * does not send it. Capped, so that a wrong header cannot park a screen for an
 * hour.
 */
export function getRetryAfterMs(error: unknown, now = Date.now()): number {
  const header = isApiError(error)
    ? error.response?.headers.get('Retry-After')
    : null;
  const milliseconds = parseRetryAfter(header, now);

  return milliseconds === undefined
    ? DEFAULT_RETRY_AFTER_MS
    : Math.min(milliseconds, MAX_RETRY_AFTER_MS);
}

const MISSING_SCOPE = /missing required scope:\s*([a-z]+:[a-z0-9_*]+)/i;

/**
 * A text member of the `value` of the first error of a problem: where the API
 * puts what a refusal is about (`retentionStart` of a usage that is no longer
 * kept, `replacementInvoiceId` of an invoice that was already recomposed).
 */
export function getProblemValueMember(
  errors: readonly ErrorDetail[],
  member: string,
): string | undefined {
  const value = errors[0]?.value;
  const found =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)[member]
      : undefined;

  return typeof found === 'string' ? found : undefined;
}

/**
 * Where the usage that is kept begins, from the refusal of a history that reaches
 * before it. The refusal of the usage history of an instance names it as the bare
 * `value` of its error (`"2027-01-01T00:00:00Z"`, `message: "retentionStart"`),
 * and the one of an invoice line, whose body is the metering of the line, as a
 * member of an object when it names it at all. Only a date is read as one.
 */
function getRetentionStart(errors: readonly ErrorDetail[]): string | undefined {
  const member = getProblemValueMember(errors, 'retentionStart');
  if (member !== undefined) {
    return member;
  }
  const value = errors[0]?.value;

  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

// What to say of a failure that is not a problem document. Only a problem is the
// API speaking: any other body is the text or the HTML page of a gateway, so the
// message is the generic one of the status (or of the network), as the route
// error page does. Reading it logs nothing, so a component can do it on every
// render.
function messageOfFailure(error: unknown): string | undefined {
  if (isApiError(error)) {
    return getErrorMessage({ ...mapApiError(error), message: '' });
  }

  return error instanceof Error ? error.message : undefined;
}

function classify(
  code: string | undefined,
  status: number | undefined,
): BillingProblemKind {
  if (code === 'Auth.MissingScope') {
    return 'missing-scope';
  }
  if (code === 'Billing.Disabled' || code === 'Billing.NotEntitled') {
    return 'unavailable';
  }
  if (code === 'Billing.EntitlementCheckUnavailable' || status === 503) {
    return 'transient';
  }
  if (code?.endsWith('.ProviderUnavailable')) {
    return 'transient';
  }
  if (code?.endsWith('.BoundaryPending')) {
    return 'boundary-pending';
  }
  if (code?.endsWith('.OutsideRetention')) {
    return 'outside-retention';
  }

  return 'generic';
}

/**
 * Reads a failure of a billing call. It never throws and writes nothing to the
 * log, so a component can call it on every render. A failure that is not a
 * problem document (a network error, a gateway's page, a bug) is read by its
 * status, `transient` for a 503 and `generic` otherwise, with a message that
 * says no more than the status does.
 */
export function handleBillingProblem(error: unknown): BillingProblem {
  const problem = getProblem(error);
  const status = isApiError(error) ? error.status : problem?.status;
  const code = problem?.code;
  const errors = problem?.errors ?? [];
  const kind = classify(code, status);
  const detail = problem ? problem.detail : messageOfFailure(error);

  const read: BillingProblem = {
    code,
    detail,
    errors,
    kind,
    status,
    title: problem?.title,
    traceId: problem?.errorId,
  };

  switch (kind) {
    case 'missing-scope':
      return { ...read, missingScope: MISSING_SCOPE.exec(detail ?? '')?.[1] };
    case 'unavailable':
      return {
        ...read,
        unavailableReason:
          code === 'Billing.NotEntitled'
            ? 'NOT_ENTITLED'
            : 'DEPLOYMENT_DISABLED',
      };
    case 'transient':
      return {
        ...read,
        providerUnavailable: code?.endsWith('.ProviderUnavailable') ?? false,
      };
    case 'boundary-pending':
      return { ...read, retryAfterMs: getRetryAfterMs(error) };
    case 'outside-retention':
      return {
        ...read,
        retentionStart: getRetentionStart(errors),
      };
    case 'generic':
      return read;
  }
}

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
 * a problem that locates its own.
 */
export function setProblemFieldError(
  form: AnyFormApi,
  field: string,
  message: string,
) {
  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: { ...meta.errorMap, onServer: { message } },
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
