// The API's ceiling for `limit`: asking for it keeps the walk below to one
// round trip for most organisations.
export const MAX_PAGE_SIZE = 200;

// The list envelope is validated at the transport boundary, not inferred from
// an HTTP 200: a proxy can return an HTML fallback with that status.
export type CursorPage<T> = {
  hasMore: boolean;
  items: T[];
  nextCursor?: string | null;
};

/**
 * A list being walked: the rows read so far, where its next page starts, and whether
 * its last page was read. A walk of one list is `fetchAllPages`; a request that
 * carries a page of several lists, each with a cursor of its own, drives one of these
 * for each.
 */
export type PageWalk<T> = {
  cursor: string | undefined;
  done: boolean;
  items: T[];
  visited: Set<string>;
};

export const startPageWalk = <T>(): PageWalk<T> => ({
  cursor: undefined,
  done: false,
  items: [],
  visited: new Set(),
});

/**
 * Takes the page just read into the walk, and moves the walk to the page after it, or
 * ends it. A page with no items is valid only when its envelope still follows the
 * protocol: this is where that is checked, for every list the console walks.
 */
export const takePage = <T>(
  walk: PageWalk<T>,
  page: CursorPage<T> | null | undefined,
): void => {
  if (
    !page ||
    typeof page.hasMore !== 'boolean' ||
    !Array.isArray(page.items) ||
    (page.nextCursor != null && typeof page.nextCursor !== 'string')
  ) {
    throw new Error('Invalid pagination response: expected items and hasMore');
  }
  walk.items.push(...page.items);
  if (!page.hasMore) {
    walk.done = true;
    walk.cursor = undefined;

    return;
  }
  if (!page.nextCursor?.trim()) {
    throw new Error('Invalid pagination response: hasMore requires a cursor');
  }
  if (walk.visited.has(page.nextCursor)) {
    throw new Error('Invalid pagination response: cursor cycle');
  }
  walk.visited.add(page.nextCursor);
  walk.cursor = page.nextCursor;
};

// List endpoints are cursor-paginated and return 50 rows unless asked for
// more. Screens that search, sort and page on the client need the whole list,
// so this walks the cursor until the server says nothing is left.
export const fetchAllPages = async <T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
  signal?: AbortSignal,
): Promise<T[]> => {
  const walk = startPageWalk<T>();

  while (!walk.done) {
    signal?.throwIfAborted();
    const page = await fetchPage(walk.cursor);
    signal?.throwIfAborted();
    takePage(walk, page);
  }

  return walk.items;
};

/**
 * The console's list shape, `{ hasMore, items }`, for an endpoint that answers a
 * plain array and not a page: the add-on families, the add-on versions and the
 * add-ons of an instance. A feature that reads one does it through here and nowhere
 * else, so that the day the API pages them, the read changes to a walk of the
 * cursor (`fetchAllPages`) in that one place and the screens do not notice.
 */
export type ListPage<T> = { hasMore: false; items: T[] };

export const toListPage = <T>(
  items: readonly T[] | null | undefined,
): ListPage<T> => ({ hasMore: false, items: [...(items ?? [])] });
