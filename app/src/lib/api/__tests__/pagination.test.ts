import { describe, expect, it, vi } from 'vite-plus/test';
import { fetchAllPages } from '../pagination';

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

  it('stops when the server claims more rows without a cursor to reach them', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ hasMore: true, items: [1], nextCursor: null });

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('stops when the server hands back the cursor it was given', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ hasMore: true, items: [1], nextCursor: 'c1' })
      .mockResolvedValue({ hasMore: true, items: [2], nextCursor: 'c1' });

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('reads an answer that is not a page as an empty list', async () => {
    // The dev server's HTML fallback answers an unmocked /api call with 200.
    const fetchPage = vi.fn().mockResolvedValueOnce('<!doctype html>');

    await expect(fetchAllPages(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
