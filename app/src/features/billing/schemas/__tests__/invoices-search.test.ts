import { describe, expect, it } from 'vite-plus/test';
import {
  handoffQueueOf,
  invoicesViewOf,
  readInvoicesLoaderDeps,
  readInvoicesSearch,
} from '../invoices-search.schema';

describe('the search of the list of invoices', () => {
  it('opens on every invoice when the URL names no view', () => {
    const read = readInvoicesSearch({});

    expect(read).toEqual({});
    expect(invoicesViewOf(read)).toBe('all');
    expect(handoffQueueOf(read)).toBeUndefined();
  });

  it('reads the scope and the filters a link starts the list on, in the views of invoices', () => {
    expect(
      readInvoicesSearch({
        customerSlug: 'initech',
        status: 'PUSH_FAILED',
      }),
    ).toEqual({ customerSlug: 'initech', status: 'PUSH_FAILED' });
  });

  it.each(['overdue', 'held'] as const)(
    'reads ?view=%s, which keeps the scope and the filters',
    (view) => {
      const read = readInvoicesSearch({
        customerSlug: 'initech',
        status: 'PUSH_FAILED',
        view,
      });

      expect(read).toEqual({
        customerSlug: 'initech',
        status: 'PUSH_FAILED',
        view,
      });
      expect(invoicesViewOf(read)).toBe(view);
      expect(handoffQueueOf(read)).toBeUndefined();
    },
  );

  it.each([
    ['waiting', 'PENDING'],
    ['acknowledged', 'ACKNOWLEDGED'],
  ] as const)(
    'reads ?view=%s as the queue in %s, and nothing of the other views',
    (view, queue) => {
      const read = readInvoicesSearch({
        customerSlug: 'initech',
        status: 'PUSH_FAILED',
        view,
      });

      expect(read).toEqual({ view });
      expect(invoicesViewOf(read)).toBe(view);
      expect(handoffQueueOf(read)).toBe(queue);
    },
  );

  it('does not read the views and the queue tabs of the earlier versions', () => {
    expect(readInvoicesSearch({ held: true, overdue: true })).toEqual({});
    expect(
      readInvoicesSearch({ queue: 'ACKNOWLEDGED', view: 'handoff' }),
    ).toEqual({});
  });

  it.each(['all', 'ALL', 'queue', 'handoff', '', 3, null, ['held']])(
    'opens on every invoice for the view %j',
    (view) => {
      const read = readInvoicesSearch({ customerSlug: 'initech', view });

      expect(invoicesViewOf(read)).toBe('all');
      expect(read).toEqual({ customerSlug: 'initech' });
    },
  );

  it('loads the scope of the invoices in a view of invoices, and no part of the queue', () => {
    expect(
      readInvoicesLoaderDeps({ customerSlug: 'initech', page: 2, view: 'held' }),
    ).toEqual({ queue: undefined, scope: { customerSlug: 'initech' } });
    expect(readInvoicesLoaderDeps({ view: 'overdue' })).toEqual(
      readInvoicesLoaderDeps({}),
    );
  });

  it('loads the invoices, which the tabs count, and the part of the queue in the views of the queue', () => {
    expect(readInvoicesLoaderDeps({ view: 'waiting' })).toEqual({
      queue: 'PENDING',
      scope: {},
    });
    expect(
      readInvoicesLoaderDeps({ customerSlug: 'initech', view: 'acknowledged' }),
    ).toEqual({ queue: 'ACKNOWLEDGED', scope: {} });
  });
});
