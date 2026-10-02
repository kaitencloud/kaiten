/**
 * Shared HTTP helpers for MSW handlers.
 *
 * Mirrors `e2e/app/_support/mocks/rest-route-helpers.ts` (Playwright side)
 * so that browser-side mocks share the same status / message conventions.
 */
import type { DefaultBodyType, PathParams, RequestHandler } from 'msw';
import { HttpResponse, type HttpResponseResolver, http } from 'msw/http';
import {
  extractOperationName,
  messageForError,
  statusForError,
  type GraphQLRequestBody,
  type GraphQLVariables,
} from '../../../e2e/app/_support/contracts/mock-http';
export {
  messageForError,
  statusForError,
} from '../../../e2e/app/_support/contracts/mock-http';

// Stubs a slot registers for resources another slot owns -- empty or
// placeholder answers that keep the slot's own pages rendering on their own.
// MSW answers with the first matching handler, so the worker registers these
// after every slot's own handlers (withFallbacksLast): an installed slot then
// answers for its resources, whichever order the slots are listed in.
const fallbackHandlers = new WeakSet<RequestHandler>();

export const asFallback = <T extends RequestHandler>(handler: T): T => {
  fallbackHandlers.add(handler);
  return handler;
};

export const withFallbacksLast = <T extends RequestHandler>(
  handlers: T[],
): T[] => [
  ...handlers.filter((handler) => !fallbackHandlers.has(handler)),
  ...handlers.filter((handler) => fallbackHandlers.has(handler)),
];

export const parseRequestJson = async <T>(request: Request): Promise<T> => {
  const body = await request.json();
  return body as T;
};

/**
 * Wrap an MSW resolver with the standard error → JSON-with-status mapping.
 * Removes the try/catch boilerplate from each route definition.
 *
 * Generic over the path params and the request body, so that inside a
 * generated handler (`handleGetCustomer(withErrorHandling(...))`) the resolver
 * reads them with the types of the operation.
 */
export const withErrorHandling = <
  Params extends PathParams<keyof Params>,
  Body extends DefaultBodyType,
>(
  errorMessage: string,
  handler: HttpResponseResolver<Params, Body>,
  persistError?: () => void,
): HttpResponseResolver<Params, Body> => {
  return async (info) => {
    try {
      const result = await handler(info);
      // MSW resolvers can return `undefined` to fall through; treat that as
      // a passthrough rather than throwing.
      if (result === undefined) {
        return undefined;
      }
      return result;
    } catch (error) {
      persistError?.();
      return HttpResponse.json(
        { message: messageForError(error, errorMessage) },
        { status: statusForError(error) },
      );
    }
  };
};

/**
 * Build a GraphQL operation router. Reads `operationName` from the body,
 * dispatches to the matching handler, and falls through to the next MSW
 * handler when the operation is unknown.
 */
export const graphqlOperationHandler = (
  operations: Record<string, (variables: GraphQLVariables) => unknown>,
) =>
  http.post(/\/api\/graphql$/, async ({ request }) => {
    let body: GraphQLRequestBody;

    try {
      body = await parseRequestJson<GraphQLRequestBody>(request.clone());
    } catch {
      return HttpResponse.json(
        { errors: [{ message: 'Invalid GraphQL request body' }] },
        { status: 400 },
      );
    }

    const operationName =
      body.operationName ?? extractOperationName(body.query ?? '') ?? 'unknown';

    const handler = operations[operationName];

    if (!handler) {
      return undefined;
    }

    try {
      return HttpResponse.json({ data: handler(body.variables) });
    } catch (error) {
      return HttpResponse.json(
        {
          data: null,
          errors: [
            {
              message: messageForError(
                error,
                `Unexpected GraphQL mock error in "${operationName}"`,
              ),
            },
          ],
        },
        { status: statusForError(error, 200) },
      );
    }
  });
