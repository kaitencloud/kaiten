import { describe, expect, it } from 'vite-plus/test';
import {
  invoicesViewOf,
  readInvoicesLoaderDeps,
  readInvoicesSearch,
} from '../invoices-search.schema';

describe('the search of the list of invoices', () => {
  it('opens on every invoice when the URL names no view', () => {
    const read = readInvoicesSearch({});

    expect(read).toEqual({});
    expect(invoicesViewOf(read)).toBe('all');
  });

  it('reads the scope and the filters a link starts the list on, in the all view', () => {
    expect(
      readInvoicesSearch({
        customerSlug: 'initech',
        held: 'true',
        status: 'PUSH_FAILED',
      }),
    ).toEqual({ customerSlug: 'initech', held: true, status: 'PUSH_FAILED' });
  });

  it('opens the queue for ?view=handoff, on what waits', () => {
    const read = readInvoicesSearch({ view: 'handoff' });

    expect(read).toEqual({ view: 'handoff' });
    expect(invoicesViewOf(read)).toBe('handoff');
  });

  it('reads the part of the queue in the handoff view, and nothing of the other view', () => {
    expect(
      readInvoicesSearch({
        customerSlug: 'initech',
        held: 'true',
        queue: 'ACKNOWLEDGED',
        status: 'PUSH_FAILED',
        view: 'handoff',
      }),
    ).toEqual({ queue: 'ACKNOWLEDGED', view: 'handoff' });
  });

  it('reads nothing of the queue in the all view', () => {
    expect(readInvoicesSearch({ queue: 'ACKNOWLEDGED' })).toEqual({});
  });

  it.each(['all', 'ALL', 'queue', '', 3, null, ['handoff']])(
    'opens on every invoice for the view %j',
    (view) => {
      const read = readInvoicesSearch({ customerSlug: 'initech', view });

      expect(invoicesViewOf(read)).toBe('all');
      expect(read).toEqual({ customerSlug: 'initech' });
    },
  );

  it('loads the scope of the invoices in the all view, and nothing else', () => {
    expect(
      readInvoicesLoaderDeps({ customerSlug: 'initech', held: true, page: 2 }),
    ).toEqual({ scope: { customerSlug: 'initech' }, view: 'all' });
  });

  it('loads the part of the queue in the handoff view', () => {
    expect(readInvoicesLoaderDeps({ view: 'handoff' })).toEqual({
      queue: 'PENDING',
      view: 'handoff',
    });
    expect(
      readInvoicesLoaderDeps({
        customerSlug: 'initech',
        queue: 'ACKNOWLEDGED',
        view: 'handoff',
      }),
    ).toEqual({ queue: 'ACKNOWLEDGED', view: 'handoff' });
  });
});
