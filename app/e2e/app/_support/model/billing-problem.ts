import type { ErrorDetail } from '@/api-client';

/**
 * The `Retry-After` the API sends with a refusal of this code, in seconds, when the mock
 * names none: a boundary being closed always carries one (a minute), and so does a
 * payment provider that could not be reached (thirty seconds) and a limit on the requests.
 */
const retryAfterOf = (
  status: number,
  code: string | undefined,
): number | undefined => {
  if (code?.endsWith('.BoundaryPending')) {
    return 60;
  }
  if (code?.endsWith('.ProviderUnavailable')) {
    return 30;
  }

  return status === 429 || code?.endsWith('.RateLimited') ? 60 : undefined;
};

/**
 * A refusal the Core API answers with a problem document. The handlers render
 * it as application/problem+json with its code and detail, so the console shows
 * the reason the real API would give, and the `Retry-After` it would send.
 */
export class BillingProblem extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly errors?: ErrorDetail[];
  /** The correlation id of the server-side log entry, which a 500 carries. */
  readonly errorId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    httpStatus: number,
    code: string | undefined,
    detail: string,
    extras: {
      errorId?: string;
      errors?: ErrorDetail[];
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(detail);
    this.httpStatus = httpStatus;
    this.code = code;
    this.errors = extras.errors;
    this.errorId = extras.errorId;
    this.retryAfterSeconds =
      extras.retryAfterSeconds ?? retryAfterOf(httpStatus, code);
  }
}
