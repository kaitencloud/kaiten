import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  FORM_RECOVERY_STORAGE_KEY,
  replaceRecord,
} from '@/lib/form-recovery';
import { makeEntry } from '@/lib/form-recovery/__tests__/test-records';
import { SIGNED_OUT_PATH, SignedOutGate } from '../signed-out-gate';

vi.mock('@clerk/react', () => ({
  RedirectToSignIn: () => (
    <p data-testid="redirect">{window.location.pathname}</p>
  ),
}));

const identity = vi.hoisted(() => ({
  last: null as { userId: string; organizationId: string } | null,
}));
vi.mock('@/lib/session-identity', () => ({
  getLastKnownIdentity: () => identity.last,
}));

function stored() {
  const raw = window.localStorage.getItem(FORM_RECOVERY_STORAGE_KEY);
  return Object.values(
    (raw ? JSON.parse(raw) : {}) as Record<string, { data: { kind: string } }>,
  ).map(({ data }) => data.kind);
}

beforeEach(() => {
  identity.last = { userId: 'user_1', organizationId: 'org_1' };
  replaceRecord(makeEntry(), { mountedAt: new Date(0).toISOString() });
  replaceRecord(makeEntry({ lineageId: 'other', userId: 'user_2' }), {
    mountedAt: new Date(0).toISOString(),
  });
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('SignedOutGate', () => {
  it('purges everything on an explicit sign-out, marks the user, and goes to sign-in from /', () => {
    window.history.replaceState(null, '', SIGNED_OUT_PATH);

    render(<SignedOutGate />);

    expect(stored()).toEqual(['userMark']);
    expect(window.location.pathname).toBe('/');
    // The redirect sees the URL the person will come back to.
    expect(screen.getByTestId('redirect')).toHaveTextContent('/');
  });

  it('purges all the same when the page was reloaded and nobody is remembered', () => {
    identity.last = null;
    window.history.replaceState(null, '', SIGNED_OUT_PATH);

    render(<SignedOutGate />);

    expect(stored()).toEqual([]);
  });

  it('keeps everything when the session merely expired, and leaves the URL alone', () => {
    window.history.replaceState(null, '', '/catalog/vouchers/new');

    render(<SignedOutGate />);

    expect(stored()).toEqual(['entry', 'entry']);
    expect(window.location.pathname).toBe('/catalog/vouchers/new');
    expect(screen.getByTestId('redirect')).toBeInTheDocument();
  });

  it('purges once under StrictMode without harm', () => {
    window.history.replaceState(null, '', SIGNED_OUT_PATH);

    render(<SignedOutGate />);
    render(<SignedOutGate />);

    expect(stored()).toEqual(['userMark']);
  });
});
