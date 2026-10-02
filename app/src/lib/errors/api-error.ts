/**
 * Normalized error thrown by the REST client, and by the GraphQL client for a
 * request the API refused.
 *
 * The fetch client (`@hey-api/client-fetch`) throws the raw parsed response
 * body on a non-2xx response and discards the HTTP status. An error interceptor
 * (see `@/lib/api/configure-api-client`) wraps every failure in an `ApiError` so downstream handlers
 * keep access to the status code, the parsed body, and the raw `Response`.
 *
 * The GraphQL client (`@/lib/graphql-client`) throws one for a non-2xx
 * response whose body is a `Problem`: what the API answers a request it
 * refuses (no identity, wrong credential kind, missing scope).
 */
export interface ApiErrorInit {
  /** HTTP status code, or `undefined` for network / request-build failures. */
  status?: number;
  /** Parsed response body (the API `Problem`), or the underlying error. */
  data: unknown;
  /** Raw fetch `Response`, when one was produced. */
  response?: Response;
  /** The original thrown value (parsed body or network error). */
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly data: unknown;
  readonly response?: Response;

  constructor({ status, data, response, cause }: ApiErrorInit) {
    super(
      `Request failed${status === undefined ? '' : ` with status ${status}`}`,
      {
        cause,
      },
    );
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.response = response;
  }
}

/**
 * Type guard for {@link ApiError}.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * True when the API answered 404: what the request named does not exist.
 */
export function isNotFoundError(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/**
 * True when the API answered 403: it knows who is asking and refuses the
 * request, for a missing scope or the wrong kind of credential.
 */
export function isForbiddenError(error: unknown): boolean {
  return isApiError(error) && error.status === 403;
}
