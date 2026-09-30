import env from '@/env';
import { getAuthToken } from './auth-token';
import { ApiError, type GraphQLError, isProblem } from './errors';

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export class GraphQLRequestError extends Error {
  readonly errors: GraphQLError[];

  constructor(errors: GraphQLError[]) {
    super(
      errors
        .flatMap((error) => (error.message ? [error.message] : []))
        .join('; ') || 'GraphQL Error',
    );
    this.name = 'GraphQLRequestError';
    this.errors = errors;
  }
}

export class GraphQLClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async request<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const token = await getAuthToken();

    const response = await fetch(`${this.baseURL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      // A failing gateway answers with an HTML error page, which is not JSON:
      // it reads as `undefined` instead of throwing a SyntaxError.
      const body: unknown = await response.json().catch(() => undefined);

      // The API refuses a request (no identity, wrong credential kind, missing
      // scope) with the problem its REST routes answer. Keep it with the status
      // in an `ApiError`, as the REST client does, so the error helpers report
      // its `detail`.
      if (isProblem(body)) {
        throw new ApiError({ status: response.status, data: body, response });
      }

      // Any other body says nothing worth keeping: surface the HTTP status.
      throw new Error(`GraphQL request failed with status ${response.status}`);
    }

    const json = (await response.json()) as GraphQLResponse<T>;

    if (json.errors?.length) {
      throw new GraphQLRequestError(json.errors);
    }

    if (!json.data) {
      throw new Error('No data returned from GraphQL');
    }

    return json.data;
  }
}

export const graphqlClient = new GraphQLClient(env.API_URL);
