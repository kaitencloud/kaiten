import { renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  FORM_RECOVERY_STORAGE_KEY,
  replaceRecord,
} from '@/lib/form-recovery';
import { makeEntry } from '@/lib/form-recovery/__tests__/test-records';
import { usePruneFormRecoveryAtStartup } from '../use-form-recovery-startup';

const identity = vi.hoisted(() => ({
  current: null as { userId: string; organizationId: string } | null,
}));
vi.mock('@/lib/session-identity', () => ({
  getSessionIdentity: () => identity.current,
}));

const farFuture = () => new Date(Date.now() + 1e9).toISOString();

function storedLineages(): string[] {
  const raw = window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY);
  const blob = (raw ? JSON.parse(raw) : {}) as Record<
    string,
    { data: { lineageId: string } }
  >;

  return Object.values(blob).map(({ data }) => data.lineageId);
}

beforeEach(() => {
  identity.current = { organizationId: 'org_1', userId: 'user_1' };
  const mountedAt = new Date(0).toISOString();
  replaceRecord(makeEntry({ expiresAt: farFuture(), lineageId: 'mine' }), {
    mountedAt,
  });
  replaceRecord(
    makeEntry({
      expiresAt: farFuture(),
      lineageId: 'foreign',
      userId: 'user_2',
    }),
    { mountedAt },
  );
});

describe('usePruneFormRecoveryAtStartup', () => {
  it('removes the input another user left in this browser, once the person is known, and keeps their own', async () => {
    renderHook(() => usePruneFormRecoveryAtStartup());

    await vi.waitFor(() => expect(storedLineages()).toEqual(['mine']));
  });

  it('does the same under StrictMode, whose effects run twice', async () => {
    renderHook(() => usePruneFormRecoveryAtStartup(), { wrapper: StrictMode });

    await vi.waitFor(() => expect(storedLineages()).toEqual(['mine']));
  });
});
