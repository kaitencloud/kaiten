import { describe, expect, it, vi } from 'vite-plus/test';
import { fetchAllPages, toListPage } from '../pagination';

describe('fetchAllPages', () => {
  it('walks the cursor until the last page', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ hasMore: true, items: [1, 2], nextCursor: 'c1' })
      .mockResolvedValueOnce({ hasMore: true, items: [3], nextCursor: 'c2' })
      .mockResolvedValueOnce({ hasMore: false, items: [4] });

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2, 3, 4]);
    expect(fetchPage.mock.calls).toEqual([[undefined], ['c1'], ['c2']]);
  });

  it('rejects when the server claims more rows without a cursor to reach them', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ hasMore: true, items: [1], nextCursor: null });

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('hasMore requires a cursor');
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('rejects when the server hands back a visited cursor', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ hasMore: true, items: [1], nextCursor: 'c1' })
      .mockResolvedValue({ hasMore: true, items: [2], nextCursor: 'c1' });

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('cursor cycle');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('rejects an answer that is not a page instead of silently showing an empty list', async () => {
    // The dev server's HTML fallback answers an unmocked /api call with 200.
    const fetchPage = vi.fn().mockResolvedValueOnce('<!doctype html>');

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('Invalid pagination response');
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('rejects a multi-cursor cycle before requesting a visited page again', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce({ hasMore: true, items: [1], nextCursor: 'a' })
      .mockResolvedValueOnce({ hasMore: true, items: [2], nextCursor: 'b' })
      .mockResolvedValueOnce({ hasMore: true, items: [3], nextCursor: 'a' });
    await expect(fetchAllPages(fetchPage)).rejects.toThrow('cursor cycle');
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('accepts an empty terminal page and refuses malformed envelopes', async () => {
    await expect(fetchAllPages(async () => ({ hasMore: false, items: [] }))).resolves.toEqual([]);
    for (const page of [null, {}, { items: [] }, { hasMore: 'false', items: [] }, { hasMore: false, items: {} }, { hasMore: false, items: [], nextCursor: 12 }]) {
      await expect(fetchAllPages(vi.fn().mockResolvedValue(page))).rejects.toThrow('Invalid pagination response');
    }
  });

  it('does not fetch another page after cancellation between pages', async () => {
    const controller = new AbortController();
    const fetchPage = vi.fn(async () => {
      controller.abort();
      return { hasMore: true, items: [1], nextCursor: 'a' };
    });
    await expect(fetchAllPages(fetchPage, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe('toListPage', () => {
  it('turns the array an endpoint answers into the list the rest of the console reads', () => {
    expect(toListPage(['a', 'b'])).toEqual({ hasMore: false, items: ['a', 'b'] });
  });

  it('is an empty list for what the API leaves out or answers null', () => {
    expect(toListPage(null)).toEqual({ hasMore: false, items: [] });
    expect(toListPage(undefined)).toEqual({ hasMore: false, items: [] });
  });

  it('copies the array, so that a change to the list never reaches what the client holds', () => {
    const answer = ['a'];
    const page = toListPage(answer);

    page.items.push('b');

    expect(answer).toEqual(['a']);
  });
});
