import { describe, expect, it } from 'vite-plus/test';
import { cn } from '@/lib/utils';
import { AUDIT_GRID } from '../components/audit-trail-event-row';

// The column header and the rows of the feed are `hidden` on a phone, where the rows made
// for it are drawn instead. `cn` merges classes, and a bare `grid` in the shared template
// would win over `hidden` and draw both at once.
describe('the grid of the audit feed', () => {
  const classes = cn('hidden border-b px-3 pb-2', AUDIT_GRID).split(' ');

  it('keeps the header hidden below the sm breakpoint', () => {
    expect(classes).toContain('hidden');
    expect(classes).not.toContain('grid');
    expect(classes).toContain('sm:grid');
  });

  it('only lays its columns out from the sm breakpoint', () => {
    const layout = AUDIT_GRID.split(' ').filter((name) => !name.startsWith('sm:'));

    expect(layout).toEqual([]);
  });
});
