import type { ErrorDetail } from '@/api-client';

/**
 * A refusal the Core API answers with a problem document. The handlers render
 * it as application/problem+json with its code and detail, so the console shows
 * the reason the real API would give.
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
    this.retryAfterSeconds = extras.retryAfterSeconds;
  }
}
