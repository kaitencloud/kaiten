import { afterAll, afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Problem } from '@/api-client/types.gen';
import { GraphQLClient } from '../../graphql-client';
import i18n from '../../i18n/config';
import { ApiError } from '../api-error';
import { getApiErrorMessage, handleApiError } from '../api-error-handler';

function apiError(status: number, data: unknown) {
  return new ApiError({ status, data });
}

// The problem the API answers on /graphql to a session that lacks a scope.
const missingScope = {
  title: 'Forbidden',
  status: 403,
  detail: 'missing required scope: read:customers',
  instance: '/api/graphql',
  code: 'Auth.MissingScope',
};

// What `graphqlClient.request` throws when the API answers with `problem`.
function graphqlRefusal(problem: Problem & { status: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(problem), {
          status: problem.status,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
    ),
  );

  return new GraphQLClient('http://api.test')
    .request('query { customers { items { id } } }')
    .catch((error: unknown) => error);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getApiErrorMessage', () => {
  it('surfaces the Problem detail of an API error', () => {
    const message = getApiErrorMessage(
      apiError(409, { title: 'Conflict', detail: 'Slug already exists' }),
    );

    expect(message).toBe('Slug already exists');
  });

  it('falls back to the Problem title when detail is missing', () => {
    const message = getApiErrorMessage(apiError(403, { title: 'Forbidden' }));

    expect(message).toBe('Forbidden');
  });

  it('maps network errors to a user-friendly message', () => {
    const message = getApiErrorMessage(
      new ApiError({ data: new TypeError('Failed to fetch') }),
    );

    expect(message).toBe(
      'Unable to connect to the server. Please check your connection.',
    );
  });

  it('keeps the message of a plain Error', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back to a localized generic message for unknown values', () => {
    expect(getApiErrorMessage('boom')).toBe('An unexpected error occurred.');
  });

  it('surfaces the detail of a request the GraphQL API refused', async () => {
    const message = getApiErrorMessage(await graphqlRefusal(missingScope));

    expect(message).toBe('missing required scope: read:customers');
  });

  describe('localization', () => {
    afterAll(async () => {
      await i18n.changeLanguage('en');
    });

    it('localizes generic fallback messages to the active locale', async () => {
      await i18n.changeLanguage('fr');
      const message = getApiErrorMessage(
        new ApiError({ data: new TypeError('Failed to fetch') }),
      );
      expect(message).toBe(
        'Impossible de se connecter au serveur. Vérifiez votre connexion.',
      );
    });

    it('keeps server-provided detail regardless of locale', async () => {
      await i18n.changeLanguage('fr');
      const message = getApiErrorMessage(
        apiError(409, { title: 'Conflict', detail: 'Slug already exists' }),
      );
      expect(message).toBe('Slug already exists');
    });
  });
});

describe('handleApiError', () => {
  it('keeps the status and the detail of a request the GraphQL API refused', async () => {
    const error = await graphqlRefusal(missingScope);

    expect(handleApiError(error)).toEqual({
      code: 'FORBIDDEN',
      status: 403,
      message: 'missing required scope: read:customers',
      originalError: error,
    });
  });

  it('reads a request without identity on /graphql as unauthorized', async () => {
    const error = await graphqlRefusal({
      title: 'Unauthorized',
      status: 401,
      detail: 'no identity found in context',
      instance: '/api/graphql',
      code: 'Auth.NoIdentity',
    });

    expect(handleApiError(error)).toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'no identity found in context',
    });
  });
});
