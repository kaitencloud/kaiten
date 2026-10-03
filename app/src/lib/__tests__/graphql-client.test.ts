import { HttpResponse, http } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { getAuthToken } from '../auth-token';
import { ApiError } from '../errors';
import { GraphQLClient } from '../graphql-client';

vi.mock('../auth-token', () => ({
  getAuthToken: vi.fn(async () => undefined),
}));

const baseURL = 'http://localhost:3001';

/**
 * Answers the client's requests with `respond`, and returns the requests it
 * received, as they went over the wire.
 */
function serveGraphQL(respond: () => Response) {
  const requests: Request[] = [];
  server.use(
    http.post(`${baseURL}/graphql`, ({ request }) => {
      requests.push(request.clone());
      return respond();
    }),
  );
  return requests;
}

describe('GraphQLClient', () => {
  let client: GraphQLClient;

  beforeEach(() => {
    client = new GraphQLClient(baseURL);
    vi.mocked(getAuthToken).mockReset();
    vi.mocked(getAuthToken).mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should create a client with the provided baseURL', () => {
      const customClient = new GraphQLClient('https://api.example.com');
      expect(customClient).toBeInstanceOf(GraphQLClient);
    });
  });

  describe('request', () => {
    const mockQuery = 'query { users { id name } }';
    const mockVariables = { id: '123' };
    const mockData = { users: [{ id: '1', name: 'John' }] };

    it('should make a POST request to /graphql endpoint', async () => {
      const requests = serveGraphQL(() => HttpResponse.json({ data: mockData }));

      await client.request(mockQuery);

      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('POST');
      expect(requests[0].headers.get('Content-Type')).toBe('application/json');
      // `variables: undefined` does not survive JSON.stringify.
      expect(await requests[0].json()).toEqual({ query: mockQuery });
    });

    it('should include Authorization header when token is present', async () => {
      const mockToken = 'test-token-123';
      vi.mocked(getAuthToken).mockResolvedValue(mockToken);
      const requests = serveGraphQL(() => HttpResponse.json({ data: mockData }));

      await client.request(mockQuery);

      expect(requests[0].headers.get('Authorization')).toBe(
        `Bearer ${mockToken}`,
      );
    });

    it('should not include Authorization header when token is not present', async () => {
      const requests = serveGraphQL(() => HttpResponse.json({ data: mockData }));

      await client.request(mockQuery);

      expect(requests[0].headers.has('Authorization')).toBe(false);
    });

    it('should send variables in the request body', async () => {
      const requests = serveGraphQL(() => HttpResponse.json({ data: mockData }));

      await client.request(mockQuery, mockVariables);

      expect(await requests[0].json()).toEqual({
        query: mockQuery,
        variables: mockVariables,
      });
    });

    it('should return data when request is successful', async () => {
      serveGraphQL(() => HttpResponse.json({ data: mockData }));

      const result = await client.request(mockQuery);

      expect(result).toEqual(mockData);
    });

    it('should throw error when GraphQL errors are present', async () => {
      const mockError = { message: 'Field not found', path: ['user', 'email'] };
      serveGraphQL(() => HttpResponse.json({ errors: [mockError] }));

      await expect(client.request(mockQuery)).rejects.toThrow('Field not found');
    });

    it('should throw error with default message when error has no message', async () => {
      serveGraphQL(() => HttpResponse.json({ errors: [{}] }));

      await expect(client.request(mockQuery)).rejects.toThrow('GraphQL Error');
    });

    it('should throw error when no data is returned', async () => {
      serveGraphQL(() => HttpResponse.json({}));

      await expect(client.request(mockQuery)).rejects.toThrow(
        'No data returned from GraphQL',
      );
    });

    it('should throw error when data is null', async () => {
      serveGraphQL(() => HttpResponse.json({ data: null }));

      await expect(client.request(mockQuery)).rejects.toThrow(
        'No data returned from GraphQL',
      );
    });

    it('should preserve all GraphQL errors', async () => {
      serveGraphQL(() =>
        HttpResponse.json({
          errors: [{ message: 'First error' }, { message: 'Second error' }],
        }),
      );

      await expect(client.request(mockQuery)).rejects.toThrow(
        'First error; Second error',
      );
    });

    it('should work with typed responses', async () => {
      interface User {
        id: string;
        name: string;
      }
      interface UsersResponse {
        users: User[];
      }

      const typedData: UsersResponse = {
        users: [{ id: '1', name: 'John' }],
      };
      serveGraphQL(() => HttpResponse.json({ data: typedData }));

      const result = await client.request<UsersResponse>(mockQuery);

      expect(result).toEqual(typedData);
      expect(result.users[0].name).toBe('John');
    });

    it('should ask the shared auth provider for the latest token', async () => {
      vi.mocked(getAuthToken).mockResolvedValue('session-token-456');
      serveGraphQL(() => HttpResponse.json({ data: mockData }));

      await client.request(mockQuery);

      expect(getAuthToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('aborts an in-flight request and the resolver sees the signal', async () => {
      const controller = new AbortController();
      let resolveStarted!: () => void;
      const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
      let sawAbort = false;
      server.use(http.post(`${baseURL}/graphql`, async ({ request }) => {
        resolveStarted();
        await new Promise<void>((resolve) => request.signal.addEventListener('abort', () => {
          sawAbort = true; resolve();
        }, { once: true }));
        return HttpResponse.json({ data: {} });
      }));
      const result = client.request('query { test }', undefined, controller.signal);
      const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
      await started;
      controller.abort();
      await rejection;
      expect(sawAbort).toBe(true);
    });

    it('does not send a request cancelled while obtaining a credential', async () => {
      const controller = new AbortController();
      vi.mocked(getAuthToken).mockImplementation(async () => {
        controller.abort(); return 'token';
      });
      const requests = serveGraphQL(() => HttpResponse.json({ data: {} }));
      await expect(client.request('query { test }', undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
      expect(requests).toHaveLength(0);
    });
    it('should handle network errors', async () => {
      serveGraphQL(() => HttpResponse.error());

      await expect(client.request('query { test }')).rejects.toBeInstanceOf(
        TypeError,
      );
    });

    it('should surface the HTTP status when the response is not ok', async () => {
      // A failing gateway answers with an HTML page, which is not JSON.
      serveGraphQL(
        () =>
          new HttpResponse('<html>Bad Gateway</html>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          }),
      );

      await expect(client.request('query { test }')).rejects.toThrow(
        'GraphQL request failed with status 502',
      );
    });

    // The three refusals the API answers on /graphql, with the body its REST
    // routes send for them.
    it.each([
      {
        type: 'https://tools.ietf.org/html/rfc7235#section-3.1',
        title: 'Unauthorized',
        status: 401,
        detail: 'no identity found in context',
        instance: '/api/graphql',
        code: 'Auth.NoIdentity',
      },
      {
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.3',
        title: 'Forbidden',
        status: 403,
        detail:
          'this operation does not accept the credential class used to authenticate',
        instance: '/api/graphql',
        code: 'Auth.WrongCredentialKind',
      },
      {
        type: 'https://tools.ietf.org/html/rfc7231#section-6.5.3',
        title: 'Forbidden',
        status: 403,
        detail: 'missing required scope: read:customers',
        instance: '/api/graphql',
        code: 'Auth.MissingScope',
      },
    ])(
      'should throw an ApiError with the status and the problem of a $code refusal',
      async (problem) => {
        serveGraphQL(() =>
          HttpResponse.json(problem, {
            status: problem.status,
            headers: { 'Content-Type': 'application/problem+json' },
          }),
        );

        const error: unknown = await client
          .request('query { test }')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: problem.status, data: problem });
        expect((error as ApiError).response?.status).toBe(problem.status);
      },
    );

    it('should keep the status fallback for an error body that is not JSON', async () => {
      // The gateway's own answer to a request without a token.
      serveGraphQL(
        () =>
          new HttpResponse('Jwt is missing', {
            status: 401,
            headers: { 'Content-Type': 'text/plain' },
          }),
      );

      const error: unknown = await client
        .request('query { test }')
        .catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(ApiError);
      expect((error as Error).message).toBe(
        'GraphQL request failed with status 401',
      );
    });

    it('should keep the status fallback for a JSON error body that is not a problem', async () => {
      // gqlgen's own answer to a document the schema rejects.
      serveGraphQL(() =>
        HttpResponse.json(
          {
            errors: [
              {
                message: 'Cannot query field "nope" on type "Query".',
                extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
              },
            ],
            data: null,
          },
          { status: 422 },
        ),
      );

      const error: unknown = await client
        .request('query { nope }')
        .catch((e: unknown) => e);

      expect(error).not.toBeInstanceOf(ApiError);
      expect((error as Error).message).toBe(
        'GraphQL request failed with status 422',
      );
    });

    it('should handle JSON parse errors', async () => {
      serveGraphQL(
        () =>
          new HttpResponse('{ not json', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      );

      await expect(client.request('query { test }')).rejects.toBeInstanceOf(
        SyntaxError,
      );
    });
  });
});
