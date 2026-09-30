import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { getAuthToken } from '../auth-token';
import { ApiError } from '../errors';
import { GraphQLClient } from '../graphql-client';

vi.mock('../auth-token', () => ({
  getAuthToken: vi.fn(async () => undefined),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GraphQLClient', () => {
  let client: GraphQLClient;
  const baseURL = 'http://localhost:3001';

  beforeEach(() => {
    client = new GraphQLClient(baseURL);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
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
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData }),
      });

      await client.request(mockQuery);

      expect(mockFetch).toHaveBeenCalledWith(`${baseURL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mockQuery,
          variables: undefined,
        }),
      });
    });

    it('should include Authorization header when token is present', async () => {
      const mockToken = 'test-token-123';
      vi.mocked(getAuthToken).mockResolvedValue(mockToken);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData }),
      });

      await client.request(mockQuery);

      expect(mockFetch).toHaveBeenCalledWith(`${baseURL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockToken}`,
        },
        body: JSON.stringify({
          query: mockQuery,
          variables: undefined,
        }),
      });
    });

    it('should not include Authorization header when token is not present', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData }),
      });

      await client.request(mockQuery);

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
      expect(callArgs.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(callArgs.headers).not.toHaveProperty('Authorization');
    });

    it('should send variables in the request body', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData }),
      });

      await client.request(mockQuery, mockVariables);

      expect(mockFetch).toHaveBeenCalledWith(`${baseURL}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mockQuery,
          variables: mockVariables,
        }),
      });
    });

    it('should return data when request is successful', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData }),
      });

      const result = await client.request(mockQuery);

      expect(result).toEqual(mockData);
    });

    it('should throw error when GraphQL errors are present', async () => {
      const mockError = { message: 'Field not found', path: ['user', 'email'] };
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ errors: [mockError] }),
      });

      await expect(client.request(mockQuery)).rejects.toThrow('Field not found');
    });

    it('should throw error with default message when error has no message', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ errors: [{}] }),
      });

      await expect(client.request(mockQuery)).rejects.toThrow('GraphQL Error');
    });

    it('should throw error when no data is returned', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(client.request(mockQuery)).rejects.toThrow(
        'No data returned from GraphQL',
      );
    });

    it('should throw error when data is null', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: null }),
      });

      await expect(client.request(mockQuery)).rejects.toThrow(
        'No data returned from GraphQL',
      );
    });

    it('should preserve all GraphQL errors', async () => {
      const mockErrors = [
        { message: 'First error' },
        { message: 'Second error' },
      ];
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ errors: mockErrors }),
      });

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

      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: typedData }),
      });

      const result = await client.request<UsersResponse>(mockQuery);

      expect(result).toEqual(typedData);
      expect(result.users[0].name).toBe('John');
    });

    it('should ask the shared auth provider for the latest token', async () => {
      const mockToken = 'session-token-456';
      vi.mocked(getAuthToken).mockResolvedValue(mockToken);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: mockData }),
      });

      await client.request(mockQuery);

      expect(getAuthToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.request('query { test }')).rejects.toThrow(
        'Network error',
      );
    });

    it('should surface the HTTP status when the response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });

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
        const response = new Response(JSON.stringify(problem), {
          status: problem.status,
          headers: { 'Content-Type': 'application/problem+json' },
        });
        mockFetch.mockResolvedValueOnce(response);

        const error: unknown = await client
          .request('query { test }')
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: problem.status, data: problem });
        expect((error as ApiError).response).toBe(response);
      },
    );

    it('should keep the status fallback for an error body that is not JSON', async () => {
      // The gateway's own answer to a request without a token.
      mockFetch.mockResolvedValueOnce(
        new Response('Jwt is missing', {
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
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errors: [
              {
                message: 'Cannot query field "nope" on type "Query".',
                extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
              },
            ],
            data: null,
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
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
      vi.mocked(getAuthToken).mockResolvedValue(undefined);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(client.request('query { test }')).rejects.toThrow(
        'Invalid JSON',
      );
    });
  });
});
