import type { ErrorDetail, Problem } from '@/api-client/types.gen';

/**
 * Application error codes.
 *
 * Single source of truth: every code must have an `Errors.api.<code>`
 * translation in `lib/i18n/locales/{en,fr}.ts`. The `check:api-error-i18n`
 * script enforces this.
 */
export const API_ERROR_CODES = [
  'UNKNOWN',
  'NETWORK',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVER_ERROR',
  'GRAPHQL_ERROR',
] as const;

export type AppErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Standardized application error
 */
export interface AppError {
  code: AppErrorCode;
  message: string;
  status?: number;
  details?: ErrorDetail[];
  originalError?: unknown;
}

/**
 * GraphQL error structure
 */
export interface GraphQLError {
  message: string;
  path?: string[];
  extensions?: Record<string, unknown>;
}

/**
 * GraphQL response with potential errors
 */
export interface GraphQLErrorResponse {
  errors?: GraphQLError[];
  data?: unknown;
}

/**
 * Type guard for Problem (API error response)
 */
export function isProblem(error: unknown): error is Problem {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('title' in error || 'detail' in error || 'status' in error)
  );
}

/**
 * Type guard for GraphQL error response
 */
export function isGraphQLErrorResponse(
  response: unknown,
): response is GraphQLErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'errors' in response &&
    Array.isArray((response as GraphQLErrorResponse).errors)
  );
}
