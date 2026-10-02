import { setupServer } from 'msw/node';

/**
 * The network of the unit tests. It answers nothing by default, and a request
 * that no handler answers fails with a network error and an `[MSW]` error
 * (`msw-setup.ts` starts it with `onUnhandledFrame: 'error'`), so no test ever
 * reaches a real API.
 *
 * A test declares what the API answers with `server.use(...)`, through the
 * handlers generated per operation in `@/api-client/msw.gen` when the endpoint
 * is in the OpenAPI contract, and `http` from `msw/http` otherwise (GraphQL).
 * `msw-setup.ts` drops them after each test.
 */
export const server = setupServer();
