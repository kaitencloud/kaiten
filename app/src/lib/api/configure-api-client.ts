import { client } from '@/api-client/client.gen';
import env from '@/env';
import { getAuthToken } from '../auth-token';
import { ApiError } from '../errors/api-error';

/** Configures the shared REST transport before route query keys are evaluated. */
export function configureApiClient() {
  client.setConfig({ baseUrl: env.API_URL });

  // Read the current token for every request, including after session switches.
  // Generated bearer security also accepts an auth callback; the interceptor
  // keeps token resolution and removal in one place for every SDK operation.
  client.interceptors.request.use(async (request) => {
    const token = await getAuthToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    } else {
      request.headers.delete('Authorization');
    }
    return request;
  });

  // Preserve HTTP status and parsed body; network errors have no response.
  client.interceptors.error.use(
    (error, response) => {
      // Cancellation is transport control flow, not a failed business request.
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return error;
      return new ApiError({
        status: response?.status,
        data: error,
        response,
        cause: error,
      });
    },
  );
}
