import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

const getStoredDevTokenMock = vi.hoisted(() => vi.fn());

vi.mock('virtual:dev-tokens', () => ({
  default: [
    {
      token: 'with-external',
      user_id: 'local-user',
      org_id: 'internal-org',
      org_external_id: 'org_external',
    },
    { token: 'without-external', user_id: 'older-user', org_id: 'internal-org' },
  ],
}));
vi.mock('../local-auth', () => ({ getStoredDevToken: getStoredDevTokenMock }));

type ClerkWindow = { Clerk?: unknown };
let originalClerk: unknown;

async function load() {
  return (await import('../session-identity')).getSessionIdentity;
}

beforeEach(() => {
  originalClerk = (window as ClerkWindow).Clerk;
  vi.stubEnv('VITE_LOCAL_AUTH', 'false');
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'false');
  getStoredDevTokenMock.mockReset().mockReturnValue(null);
});

afterEach(() => {
  (window as ClerkWindow).Clerk = originalClerk;
  vi.unstubAllEnvs();
});

describe('getSessionIdentity', () => {
  it('reads the external ids Clerk exposes', async () => {
    (window as ClerkWindow).Clerk = {
      user: { id: 'user_1' },
      organization: { id: 'org_1' },
    };

    expect((await load())()).toEqual({
      userId: 'user_1',
      organizationId: 'org_1',
    });
  });

  it('uses an empty organization id outside an organization', async () => {
    (window as ClerkWindow).Clerk = { user: { id: 'user_1' } };

    expect((await load())()).toEqual({ userId: 'user_1', organizationId: '' });
  });

  it('is null while nobody is signed in', async () => {
    (window as ClerkWindow).Clerk = { user: null };
    expect((await load())()).toBeNull();

    (window as ClerkWindow).Clerk = undefined;
    expect((await load())()).toBeNull();
  });

  it('reads the selected dev token with local accounts', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    getStoredDevTokenMock.mockReturnValue('with-external');

    expect((await load())()).toEqual({
      userId: 'local-user',
      organizationId: 'org_external',
    });
  });

  it('falls back to the internal organization id of a token that has no external one', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    getStoredDevTokenMock.mockReturnValue('without-external');

    expect((await load())()).toEqual({
      userId: 'older-user',
      organizationId: 'internal-org',
    });
  });

  it('is null with local accounts when no known token is selected', async () => {
    vi.stubEnv('VITE_LOCAL_AUTH', 'true');
    getStoredDevTokenMock.mockReturnValue('unknown');

    expect((await load())()).toBeNull();
  });

  it('is a fixed identity in the bypassed build', async () => {
    vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');

    expect((await load())()).toEqual({
      userId: 'e2e',
      organizationId: 'e2e',
    });
  });
});
