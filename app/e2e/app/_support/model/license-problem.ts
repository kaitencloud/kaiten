import type { ErrorDetail } from '@/api-client';

/**
 * A refusal the Core API answers with a problem document. The handlers render
 * it as application/problem+json, so the console shows the reason the real API
 * would give: its stable `code`, its `detail` and, where the API sends them, the
 * field errors.
 */
export class LicenseProblem extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly errors?: ErrorDetail[];

  constructor(
    httpStatus: number,
    code: string,
    detail: string,
    errors?: ErrorDetail[],
  ) {
    super(detail);
    this.httpStatus = httpStatus;
    this.code = code;
    this.errors = errors;
  }
}
