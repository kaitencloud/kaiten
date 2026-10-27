import i18n from 'i18next';
import { logger } from '../logger';
import type { ApiError } from './api-error';
import { isApiError } from './api-error';
import type { AppError, AppErrorCode, GraphQLErrorResponse } from './types';
import { isProblem, isGraphQLErrorResponse } from './types';

/**
 * Map HTTP status codes to AppErrorCode
 */
function mapStatusToCode(status: number): AppErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'SERVER_ERROR';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Default translator: the shared i18next instance. Lets error messages be
 * localized to the active language even when no `t` is threaded in from a React
 * component — most callers are plain mutation handlers outside a component.
 */
const defaultTranslate = (key: string): string => i18n.t(key);

/** Localized generic message for an error code (`Errors.api.<code>`). */
function genericMessage(
  code: AppErrorCode,
  t: (key: string) => string,
): string {
  return t(`Errors.api.${code}`);
}

const textOf = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

// What a problem says of itself: a sentence it wrote, not a number or an empty string that a
// JSON body of a gateway (`{ "status": 502 }`) happens to carry under the same names.
const problemText = (problem: { detail?: unknown; title?: unknown }) =>
  textOf(problem.detail) ?? textOf(problem.title);

/**
 * Map an `ApiError`, from either client, to AppError.
 *
 * What a problem document says (`detail`, `title`) is preserved as the most
 * specific signal; the generic client-side fallbacks are localized via `t`
 * (default: the active i18next locale). A body that is not a problem is the text
 * or the HTML page of a gateway (`Jwt is missing`, `<html>Bad gateway</html>`),
 * never the API speaking, so it is not shown: the message is the generic one of
 * the status.
 */
export function mapApiError(
  error: ApiError,
  t: (key: string) => string = defaultTranslate,
): AppError {
  // Network error (no response / status)
  if (error.status === undefined) {
    return {
      code: 'NETWORK',
      message: genericMessage('NETWORK', t),
      originalError: error,
    };
  }

  const { status, data } = error;
  const code = mapStatusToCode(status);

  // Handle API Problem format
  if (isProblem(data)) {
    return {
      code,
      status,
      message: problemText(data) ?? genericMessage(code, t),
      details: data.errors ?? undefined,
      originalError: error,
    };
  }

  // Fallback for non-standard error responses: what a gateway answered is never
  // printed.
  return {
    code,
    status,
    message: genericMessage(code, t),
    originalError: error,
  };
}

/**
 * Map GraphQL errors to AppError.
 */
export function mapGraphQLError(
  response: GraphQLErrorResponse,
  t: (key: string) => string = defaultTranslate,
): AppError {
  const message =
    response.errors
      ?.flatMap((error) => (error.message ? [error.message] : []))
      .join('; ') || genericMessage('GRAPHQL_ERROR', t);

  return {
    code: 'GRAPHQL_ERROR',
    message,
    originalError: response,
  };
}

/**
 * Central error handler for all API errors.
 *
 * Transforms various error types into a standardized AppError format. Generic
 * fallback messages are localized to the active locale (override with `t`).
 *
 * @example
 * try {
 *   await createCustomer({ body: data, throwOnError: true });
 * } catch (error) {
 *   toast.error(getApiErrorMessage(error));
 * }
 */
export function handleApiError(
  error: unknown,
  t: (key: string) => string = defaultTranslate,
): AppError {
  // Handle REST API errors, and GraphQL requests the API refused
  if (isApiError(error)) {
    const appError = mapApiError(error, t);
    logger.error(new Error(appError.message), {
      code: appError.code,
      status: appError.status,
    });
    return appError;
  }

  // Handle GraphQL error responses
  if (isGraphQLErrorResponse(error)) {
    const appError = mapGraphQLError(error, t);
    logger.error(new Error(appError.message), { code: appError.code });
    return appError;
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    logger.error(error);
    return {
      code: 'UNKNOWN',
      message: error.message,
      originalError: error,
    };
  }

  // Handle unknown error types
  logger.error(new Error('Unknown error occurred'), { rawError: error });
  return {
    code: 'UNKNOWN',
    message: genericMessage('UNKNOWN', t),
    originalError: error,
  };
}

/**
 * Get a user-friendly error message from an AppError.
 *
 * Prefers the (already-resolved) error message — a specific server `detail`
 * when present, otherwise the localized generic message produced upstream.
 * `t` overrides the locale used for the generic fallback.
 */
export function getErrorMessage(
  error: AppError,
  t: (key: string) => string = defaultTranslate,
): string {
  return error.message || genericMessage(error.code, t);
}

/**
 * One-step helper for mutation `onError` handlers: maps any thrown error
 * (Axios, GraphQL response, plain Error) to its user-facing message.
 *
 * Localizes via the active locale by default; pass a component's `t` to use a
 * scoped translator instead.
 *
 * @example
 * onError: (error) => toast.error(getApiErrorMessage(error)),
 */
export function getApiErrorMessage(
  error: unknown,
  t?: (key: string) => string,
): string {
  return getErrorMessage(handleApiError(error, t), t);
}
