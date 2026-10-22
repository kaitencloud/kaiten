import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Instance } from '@/api-client';
import { handleGetInstance, handleUpdateInstance } from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`, which carries the
// words of the API's refusal.
import '@/lib/api/bootstrap';
import {
  instanceDetailsFormValuesToInstanceInput,
  instanceToDetailsFormValues,
} from '../../utils/instance-form.shared';
import { useInstanceDetailMutations } from '../instance-detail/use-instance-detail-mutations';
import { useInstanceDeploymentMutation } from '../use-instance-deployment-mutation';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

let queryClient: QueryClient;

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), track: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/domains/crm-sync', () => ({ startAttioSyncWatcher: vi.fn() }));
vi.mock('../instance-query-invalidation', () => ({
  forgetDeletedInstanceQueries: vi.fn(),
  invalidateInstanceQueries: vi.fn(),
}));

const opened = {
  customerId: 'customer-1',
  deploymentZoneId: 'zone-1',
  description: 'The production instance',
  endLicenseDate: '2026-12-31T00:00:00.000Z',
  id: 'instance-1',
  licenseId: 'license-1',
  licenseSlug: 'business',
  metadata: { region: 'eu' },
  name: 'Globex Production',
  slug: 'globex-production',
  startLicenseDate: '2026-01-01T00:00:00.000Z',
} as unknown as Instance;

let stored: Instance;
let updates: Array<{ body: unknown; instanceSlug: string }>;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  toast.error.mockReset();
  toast.success.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetInstance(() => HttpResponse.json(stored)),
    handleUpdateInstance(async ({ params, request }) => {
      updates.push({
        body: await request.json(),
        instanceSlug: params.instanceSlug,
      });

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const gone = () =>
  server.use(
    handleGetInstance(() =>
      HttpResponse.json(
        { detail: 'The instance does not exist', status: 404 },
        { status: 404 },
      ),
    ),
  );

describe('attaching an instance to a zone', () => {
  it('sends the zone on top of the instance as the API holds it, not as the page loaded it', async () => {
    const { result } = renderHook(() => useInstanceDeploymentMutation(), {
      wrapper,
    });
    // Another tab renamed the instance and moved its license window.
    stored = {
      ...opened,
      endLicenseDate: '2027-06-30T00:00:00.000Z',
      name: 'Globex Production EU',
    };

    await act(() => result.current.deployInstance(opened, 'zone-2'));

    expect(updates).toEqual([
      {
        body: {
          customerId: 'customer-1',
          deploymentZoneId: 'zone-2',
          description: 'The production instance',
          endLicenseDate: '2027-06-30T00:00:00.000Z',
          licenseId: 'license-1',
          metadata: { region: 'eu' },
          name: 'Globex Production EU',
          startLicenseDate: '2026-01-01T00:00:00.000Z',
        },
        instanceSlug: 'globex-production',
      },
    ]);
  });

  it('says the instance is gone when it was deleted meanwhile, and writes nothing', async () => {
    const { result } = renderHook(() => useInstanceDeploymentMutation(), {
      wrapper,
    });
    gone();

    await expect(
      act(() => result.current.deployInstance(opened, 'zone-2')),
    ).rejects.toBeDefined();

    expect(updates).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('The instance does not exist');
  });
});

describe('renaming an instance from its page', () => {
  const rename = (
    update: (edited: never, opened: never) => Promise<void>,
    name: string,
  ) => {
    const values = instanceToDetailsFormValues(opened);

    return update(
      instanceDetailsFormValuesToInstanceInput({ ...values, name }, opened) as never,
      instanceDetailsFormValuesToInstanceInput(values, opened) as never,
    );
  };

  it('sends the name on top of the instance as the API holds it', async () => {
    const { result } = renderHook(
      () => useInstanceDetailMutations('globex-production'),
      { wrapper },
    );
    stored = {
      ...opened,
      deploymentZoneId: 'zone-2',
      metadata: { region: 'us' },
    };

    await act(() => rename(result.current.updateInstance, 'Globex Prod'));

    expect(updates).toEqual([
      {
        body: expect.objectContaining({
          deploymentZoneId: 'zone-2',
          metadata: { region: 'us' },
          name: 'Globex Prod',
        }),
        instanceSlug: 'globex-production',
      },
    ]);
  });

  it('rejects when the instance was deleted meanwhile, and writes nothing', async () => {
    const { result } = renderHook(
      () => useInstanceDetailMutations('globex-production'),
      { wrapper },
    );
    gone();

    await expect(
      act(() => rename(result.current.updateInstance, 'Globex Prod')),
    ).rejects.toBeDefined();

    expect(updates).toEqual([]);
  });
});
