import type { Route } from '@playwright/test';
import {
  getPathSegments,
  messageForError,
  statusForError,
} from '../contracts/mock-http';
export {
  getPathSegments,
  messageForError,
  statusForError,
} from '../contracts/mock-http';

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
