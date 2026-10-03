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

// List endpoints are cursor-paginated and return 50 rows unless asked for
// more. Screens that search, sort and page on the client need the whole list,
// so this walks the cursor until the server says nothing is left. A page
// with no items is valid only when its envelope still follows the protocol.
export const fetchAllPages = async <T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
  signal?: AbortSignal,
): Promise<T[]> => {
  const items: T[] = [];
  const visited = new Set<string>();
  let cursor: string | undefined;

  do {
    signal?.throwIfAborted();
    const page = await fetchPage(cursor);
    signal?.throwIfAborted();
    if (
      !page ||
      typeof page.hasMore !== 'boolean' ||
      !Array.isArray(page.items) ||
      (page.nextCursor != null && typeof page.nextCursor !== 'string')
    ) {
      throw new Error(
        'Invalid pagination response: expected items and hasMore',
      );
    }
    items.push(...page.items);
    if (!page.hasMore) break;
    if (!page.nextCursor?.trim()) {
      throw new Error('Invalid pagination response: hasMore requires a cursor');
    }
    if (visited.has(page.nextCursor)) {
      throw new Error('Invalid pagination response: cursor cycle');
    }
    visited.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);

  return items;
};
