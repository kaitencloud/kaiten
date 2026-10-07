import type { Page } from '@playwright/test';

export type RecordedWrite = {
  /** The JSON body the page sent; `null` when the request had none. */
  body: unknown;
  method: string;
  /** The path of the request, without its query: `/api/licenses/pro-v4/prices`. */
  pathname: string;
  /**
   * The query of the request, as the page sent it: `?status=PAID&limit=50`. It is left
   * out when the request has none, so a spec that compares a write whole is not
   * asked to say that it had none.
   */
  search?: string;
};

/**
 * Records, from now on, every write the page sends to a path that matches, with
 * the body it carried. A spec reads the list once the call has answered: what the
 * page sent is what the API would have been given, which a screen alone does not
 * show (an amount typed as `49.00` goes out as `4900`). Given `['GET']` it records
 * the reads instead, with the query they carried, which is what a list sends the
 * API for its filters.
 */
export function recordWrites(
  page: Page,
  pathname: RegExp,
  methods: readonly string[] = ['POST', 'PUT', 'PATCH', 'DELETE'],
): RecordedWrite[] {
  const writes: RecordedWrite[] = [];

  page.on('request', (request) => {
    const { pathname: path, search } = new URL(request.url());
    if (!methods.includes(request.method()) || !pathname.test(path)) {
      return;
    }
    writes.push({
      body: request.postData() === null ? null : request.postDataJSON(),
      method: request.method(),
      pathname: path,
      ...(search === '' ? {} : { search }),
    });
  });

  return writes;
}
