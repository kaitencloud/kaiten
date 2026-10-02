import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Problem } from '@/api-client';
import { graphqlClient } from '@/lib/graphql-client';
import { isForbiddenError } from '../metadata-field-helpers';

// What `graphqlClient.request` throws when the API answers with `respond()`:
// the fields are read over GraphQL, so this is the error the page is given.
function graphqlFailure(respond: () => Response) {
  server.use(http.post('*/api/graphql', respond));

  return graphqlClient
    .request('query { metadataFields { items { id } } }')
    .catch((error: unknown) => error);
}

function problemResponse(problem: Problem & { status: number }) {
  return () =>
    HttpResponse.json(problem, {
      status: problem.status,
      headers: { 'Content-Type': 'application/problem+json' },
    });
}

describe('isForbiddenError', () => {
  it('recognises a read the API refused for a missing scope', async () => {
    const error = await graphqlFailure(
      problemResponse({
        title: 'Forbidden',
        status: 403,
        detail: 'missing required scope: read:metadata_fields',
        instance: '/api/graphql',
        code: 'Auth.MissingScope',
      }),
    );

    expect(error).toMatchObject({ status: 403 });
    expect(isForbiddenError(error)).toBe(true);
  });

  // A gateway's own refusal is not a problem: the client throws a plain Error
  // that names the status.
  it('recognises a 403 that carries no problem', async () => {
    const error = await graphqlFailure(
      () => new HttpResponse('RBAC: access denied', { status: 403 }),
    );

    expect(isForbiddenError(error)).toBe(true);
  });

  it('does not take a request without identity for a forbidden one', async () => {
    const error = await graphqlFailure(
      problemResponse({
        title: 'Unauthorized',
        status: 401,
        detail: 'no identity found in context',
        instance: '/api/graphql',
        code: 'Auth.NoIdentity',
      }),
    );

    expect(isForbiddenError(error)).toBe(false);
  });
});
