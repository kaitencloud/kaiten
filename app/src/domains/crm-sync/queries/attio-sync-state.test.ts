import { describe, expect, it } from 'vite-plus/test';
import type { AttioSyncInfo } from '../logic';
import { isAttioSyncCardVisible } from './attio-sync-state';

const linkedSyncInfo: AttioSyncInfo = {
  externalId: 'rec_123',
  lastError: null,
  syncedAt: '2026-06-11T12:00:00Z',
  webUrl: null,
};

describe('isAttioSyncCardVisible', () => {
  it('shows a linked integration in any synchronization state', () => {
    expect(isAttioSyncCardVisible(linkedSyncInfo, { status: 'idle' })).toBe(
      true,
    );
  });

  it.each(['pending', 'delayed'] as const)(
    'shows an unlinked integration while synchronization is %s',
    (status) => {
      expect(isAttioSyncCardVisible(null, { status })).toBe(true);
    },
  );

  it('hides an unlinked idle integration', () => {
    expect(isAttioSyncCardVisible(null, { status: 'idle' })).toBe(false);
  });
});
