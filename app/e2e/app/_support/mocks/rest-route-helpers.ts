import type { Route } from '@playwright/test';

export async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export function parseJsonBody<T>(route: Route) {
  const postData = route.request().postData();
  return JSON.parse(postData ?? '{}') as T;
}

/**
 * Splits the URL pathname into its non-empty segments.
 * Used by REST mock installers to distinguish list (`/api/foo`) from
 * detail (`/api/foo/:slug`) and nested resources (`/api/foo/:slug/bar`).
 */
export function getPathSegments(url: string): string[] {
  return new URL(url).pathname.split('/').filter(Boolean);
}

/**
 * Status code returned to the client when a model handler throws.
 * Centralised so every mock installer maps errors the same way.
 */
export function statusForError(error: unknown, fallback = 400): number {
  const explicitStatus = (error as { httpStatus?: number } | undefined)
    ?.httpStatus;

  if (typeof explicitStatus === 'number') {
    return explicitStatus;
  }

  if (error instanceof Error && error.message.includes('not found')) {
    return 404;
  }

  return fallback;
}

/**
 * Extracts the human-readable message from an unknown thrown value.
 */
export function messageForError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type RouteCallback = (context: {
  route: Route;
  segments: string[];
  url: string;
}) => Promise<unknown> | unknown;

type RouteHandlers = {
  /** Number of path segments expected (e.g. `/api/customers` → 2). */
  segments: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  handle: RouteCallback;
  /** HTTP status to return on success. Defaults to 200 (or 201 for POST, 204 for DELETE). */
  successStatus?: number;
};

/**
 * Build a REST route handler that dispatches by `(method, segment count)` and
 * maps thrown errors to `httpStatus` (or 404 for "not found", 400 otherwise).
 *
 * Replaces the repetitive try/catch pattern previously duplicated in every
 * `install-*-app-mocks.ts` file.
 *
 * @example
 * await page.route('**\/api\/customers**', makeRestRouter([
 *   { method: 'GET', segments: 2, handle: () => ({ hasMore: false, items: model.listCustomers() }) },
 *   { method: 'POST', segments: 2, handle: ({ route }) =>
 *     model.createCustomer(parseJsonBody(route)) },
 * ], { errorMessage: 'Unexpected customer mock error' }));
 */
export function makeRestRouter(
  handlers: RouteHandlers[],
  options: { errorMessage?: string; defaultErrorStatus?: number } = {},
) {
  const errorMessage = options.errorMessage ?? 'Unexpected mock error';
  const defaultErrorStatus = options.defaultErrorStatus ?? 400;

  return async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();
    const segments = getPathSegments(url);

    const matched = handlers.find(
      (handler) =>
        handler.method === method && handler.segments === segments.length,
    );

    if (!matched) {
      await route.fulfill({ status: 405 });
      return;
    }

    try {
      const result = await matched.handle({ route, segments, url });

      if (matched.successStatus === 204 || method === 'DELETE') {
        await route.fulfill({ status: matched.successStatus ?? 204 });
        return;
      }

      const status = matched.successStatus ?? (method === 'POST' ? 201 : 200);
      await fulfillJson(route, status, result);
    } catch (error) {
      await fulfillJson(route, statusForError(error, defaultErrorStatus), {
        message: messageForError(error, errorMessage),
      });
    }
  };
}
