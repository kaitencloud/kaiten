import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { DeploymentZone } from '@/api-client';
import {
  handleGetDeploymentZoneBySlug,
  handleListDeploymentZones,
  handleUpdateDeploymentZone,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`, which carries the
// words of the API's refusal.
import '@/lib/api/bootstrap';
import { deploymentZoneToUpdateBody } from '../utils/deployment-zone-update-body';
import { useDeployReleaseMutation } from './use-deploy-release-mutation';
import { useDeploymentZoneForm } from './use-deployment-zone-form';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const captured = vi.hoisted(() => ({ options: null as never as any }));

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
vi.mock('@/hooks/form', () => ({
  useAppForm: (options: unknown) => {
    captured.options = options;

    return { handleSubmit: vi.fn() };
  },
}));

const opened = {
  description: 'EU production',
  id: 'zone-1',
  metadata: { region: 'eu' },
  name: 'Production EU',
  releaseId: 'release-1',
  slug: 'production-eu',
  type: 'production',
} as unknown as DeploymentZone;

let stored: DeploymentZone;
let updates: Array<{ body: unknown; deploymentZoneSlug: string }>;

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
    handleGetDeploymentZoneBySlug(() => HttpResponse.json(stored)),
    handleListDeploymentZones({ body: { hasMore: false, items: [] } }),
    handleUpdateDeploymentZone(async ({ params, request }) => {
      updates.push({
        body: await request.json(),
        deploymentZoneSlug: params.deploymentZoneSlug,
      });

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const gone = () =>
  server.use(
    handleGetDeploymentZoneBySlug(() =>
      HttpResponse.json(
        { detail: 'The deployment zone does not exist', status: 404 },
        { status: 404 },
      ),
    ),
  );

describe('deploying a release to a zone', () => {
  const deploy = (
    update: (variables: never) => Promise<unknown>,
    releaseId: string,
  ) => {
    const restated = deploymentZoneToUpdateBody(opened);

    return update({
      deploymentZoneSlug: 'production-eu',
      edited: { ...restated, releaseId },
      opened: restated,
    } as never);
  };

  it('sends the release on top of the zone as the API holds it', async () => {
    const { result } = renderHook(() => useDeployReleaseMutation(), {
      wrapper,
    });
    stored = {
      ...opened,
      description: 'Edited in another tab',
      metadata: { region: 'us' },
    };

    await act(() => deploy(result.current.mutateAsync, 'release-2'));

    expect(updates).toEqual([
      {
        body: {
          description: 'Edited in another tab',
          metadata: { region: 'us' },
          name: 'Production EU',
          releaseId: 'release-2',
          type: 'production',
        },
        deploymentZoneSlug: 'production-eu',
      },
    ]);
  });

  it('says the zone is gone when it was deleted meanwhile, and writes nothing', async () => {
    const { result } = renderHook(() => useDeployReleaseMutation(), {
      wrapper,
    });
    gone();

    await expect(
      act(() => deploy(result.current.mutateAsync, 'release-2')),
    ).rejects.toBeDefined();

    expect(updates).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(
      'The deployment zone does not exist',
    );
  });
});

describe('the form that edits a zone', () => {
  const values = (changes: Record<string, unknown> = {}) => ({
    ...captured.options.defaultValues,
    ...changes,
  });

  it('sends the fields that were changed on top of the zone as the API holds it, and no release', async () => {
    renderHook(() => useDeploymentZoneForm({ deploymentZone: opened }), {
      wrapper,
    });
    // Another tab changed the description and deployed another release.
    stored = {
      ...opened,
      description: 'Edited in another tab',
      releaseId: 'release-9',
    };

    await act(() =>
      captured.options.onSubmit({ value: values({ name: 'Production EMEA' }) }),
    );

    expect(updates).toEqual([
      {
        body: {
          description: 'Edited in another tab',
          metadata: { region: 'eu' },
          name: 'Production EMEA',
          type: 'production',
        },
        deploymentZoneSlug: 'production-eu',
      },
    ]);
  });

  it('says the zone is gone when it was deleted meanwhile, and writes nothing', async () => {
    renderHook(() => useDeploymentZoneForm({ deploymentZone: opened }), {
      wrapper,
    });
    gone();

    await act(() =>
      captured.options.onSubmit({ value: values({ name: 'Production EMEA' }) }),
    );

    expect(updates).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(
      'The deployment zone does not exist',
    );
  });
});
