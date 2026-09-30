// The API's ceiling for `limit`: asking for it keeps the walk below to one
// round trip for most organisations.
export const MAX_PAGE_SIZE = 200;

// What a list endpoint answers. Optional because the wire does not always
// hold to the contract: a proxy or the dev server's HTML fallback can answer
// 200 with something that is not a page at all.
export type CursorPage<T> = {
  hasMore?: boolean;
  items?: T[];
  nextCursor?: string | null;
};

// List endpoints are cursor-paginated and return 50 rows unless asked for
// more. Screens that search, sort and page on the client need the whole list,
// so this walks the cursor until the server says nothing is left. A page
// without rows reads as empty, as the screens read it before they walked
// pages, and the walk stops as soon as the server claims more rows without a
// new cursor to reach them.
export const fetchAllPages = async <T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): Promise<T[]> => {
  const items: T[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchPage(cursor);
    items.push(...(page?.items ?? []));
    const nextCursor = page?.hasMore
      ? (page.nextCursor ?? undefined)
      : undefined;
    cursor = nextCursor === cursor ? undefined : nextCursor;
  } while (cursor);

  return items;
};
