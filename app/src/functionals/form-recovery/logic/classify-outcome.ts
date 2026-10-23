import { isApiError } from '@/lib/errors';

export type SendOutcome = 'refused' | 'unknown';

/**
 * What a failed request says about the object it was to create.
 *
 * - `refused`: the server answered no (validation, conflict, rights, an
 *   expired session, too many requests): nothing was created;
 * - `unknown`: no answer (network, abort), a server error or a timeout, or an
 *   error that is not an API error at all. A 500 can come after the commit.
 */
export function classifyOutcome(error: unknown): SendOutcome {
  if (!isApiError(error) || error.status === undefined) {
    return 'unknown';
  }

  const { status } = error;
  return status >= 400 && status < 500 && status !== 408
    ? 'refused'
    : 'unknown';
}
