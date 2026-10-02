import type { Page, Route } from '@playwright/test';
import {
  extractOperationName,
  type GraphQLRequestBody,
  type GraphQLVariables,
} from '../contracts/mock-http';

export type GraphQLOperationHandler = (variables: GraphQLVariables) => unknown;
export type GraphQLOperations = Record<string, GraphQLOperationHandler>;

const GRAPHQL_ROUTE = '**/api/graphql';

const operationNameOf = (body: GraphQLRequestBody) =>
  body.operationName ?? extractOperationName(body.query ?? '') ?? 'unknown';

// The pages that already have the last-resort route below: one per page.
const pagesWithUnmockedOperationRoute = new WeakSet<Page>();

/**
 * Answers an operation that no installed router mocks, naming it. Installed
 * before the first router of a page, so that Playwright, which tries the
 * routes of a page from the last one installed, reaches it only once every
 * router has handed the request on.
 */
async function installUnmockedOperationRoute(page: Page) {
  if (pagesWithUnmockedOperationRoute.has(page)) {
    return;
  }
  pagesWithUnmockedOperationRoute.add(page);

  await page.route(GRAPHQL_ROUTE, async (route: Route) => {
    const body = JSON.parse(
      route.request().postData() ?? '{}',
    ) as GraphQLRequestBody;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        errors: [
          {
            message: `No mock configured for GraphQL operation "${operationNameOf(body)}"`,
          },
        ],
      }),
    });
  });
}

/**
 * Routes the GraphQL operations of one area. Each area installs its own
 * router, and an operation this one does not know goes on to the routers
 * installed before it, so that two areas installed together each answer for
 * their own operations, rather than the last one answering for all.
 */
export async function installGraphQLOperationMocks(
  page: Page,
  operations: GraphQLOperations,
) {
  await installUnmockedOperationRoute(page);

  await page.route(GRAPHQL_ROUTE, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ status: 405 });
      return;
    }

    const postData = route.request().postData();
    if (!postData) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Missing GraphQL request body' }],
        }),
      });
      return;
    }

    let body: GraphQLRequestBody;

    try {
      body = JSON.parse(postData) as GraphQLRequestBody;
    } catch {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Invalid GraphQL request body' }],
        }),
      });
      return;
    }
    const operationName = operationNameOf(body);
    const operationHandler = operations[operationName];

    if (!operationHandler) {
      await route.fallback();
      return;
    }

    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: operationHandler(body.variables),
        }),
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Unexpected GraphQL mock error in "${operationName}"`;
      const explicitStatus = (error as { httpStatus?: number }).httpStatus;

      await route.fulfill({
        status: explicitStatus ?? 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          errors: [{ message }],
        }),
      });
    }
  });
}
