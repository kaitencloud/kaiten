import { BillingProblem } from './billing-problem';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** What a list is asked for besides its filters: where to start and how many rows. */
export type PageRequest = { cursor?: string | null; limit?: number | null };

/** A page of the API's lists: the cursor is absent when nothing follows. */
type Page<T> = { hasMore: boolean; items: T[]; nextCursor?: string };

/** The cursor and the limit a request to a list carries. */
export const pageRequestOf = (query: URLSearchParams): PageRequest => {
  const limit = Number(query.get('limit'));

  return {
    cursor: query.get('cursor'),
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
  };
};

const encodeCursor = (id: string) =>
  btoa(JSON.stringify({ id })).replace(/\+/g, '-').replace(/\//g, '_');

function decodeCursor(cursor: string, code: string): string {
  try {
    const key = JSON.parse(
      atob(cursor.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { id?: unknown };
    if (typeof key.id === 'string') {
      return key.id;
    }
  } catch {
    // Falls through to the refusal below.
  }
  throw new BillingProblem(
    400,
    code,
    'the cursor is not one this list returned',
  );
}

/**
 * The page of a list the API pages: `rows` are the whole list in its order, newest
 * first, and the page is the rows after the cursor, `limit` of them (fifty unless
 * asked, at most two hundred). `resource` names the list in the refusal of a cursor
 * that is not one the list returned (`400 <resource>.InvalidCursor`).
 */
export function pageOfRows<T extends { id: string }>(
  rows: readonly T[],
  request: PageRequest,
  resource: string,
): Page<T> {
  const size = Math.min(
    request.limit && request.limit > 0 ? request.limit : DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  let start = 0;
  if (request.cursor) {
    const id = decodeCursor(request.cursor, `${resource}.InvalidCursor`);
    const position = rows.findIndex((row) => row.id === id);
    start = position === -1 ? rows.length : position + 1;
  }
  const items = rows.slice(start, start + size);
  const last = items.at(-1);
  const hasMore = start + size < rows.length && last !== undefined;

  return {
    hasMore,
    items,
    ...(hasMore ? { nextCursor: encodeCursor(last.id) } : {}),
  };
}
