import type { Page } from '@playwright/test';

type GraphQLVariables = Record<string, unknown> | undefined;
type GraphQLRequestBody = {
  operationName?: string;
  query?: string;
  variables?: GraphQLVariables;
};

export type GraphQLOperationHandler = (variables: GraphQLVariables) => unknown;
export type GraphQLOperations = Record<string, GraphQLOperationHandler>;

const extractOperationName = (query: string): string | null => {
  const match = query.match(/\b(query|mutation)\s+([a-zA-Z0-9_]+)/);
  return match?.[2] ?? null;
};

export async function installGraphQLOperationMocks(
  page: Page,
  operations: GraphQLOperations,
) {
  await page.route('**/api/graphql', async (route) => {
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
    const operationName =
      body.operationName ?? extractOperationName(body.query ?? '') ?? 'unknown';
    const operationHandler = operations[operationName];

    if (!operationHandler) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [
            {
              message: `No mock configured for GraphQL operation "${operationName}"`,
            },
          ],
        }),
      });
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
