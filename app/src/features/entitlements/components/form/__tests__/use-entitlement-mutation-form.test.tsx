import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import {
  handleGetEntitlement,
  handleListEntitlements,
  handleUpdateEntitlement,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`, which carries the
// words of the API's refusal.
import '@/lib/api/bootstrap';
import { useEntitlementMutationForm } from '../use-entitlement-mutation-form';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());
const captured = vi.hoisted(() => ({ options: null as never as any }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
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
  aggregationMethod: 'SUM',
  createdAt: '2026-03-01T09:00:00.000Z',
  description: 'Track API calls',
  displayOrder: 0,
  entitlementGroups: [{ id: 'group-usage', name: 'Usage', slug: 'usage' }],
  icon: 'lucide:zap',
  id: 'entitlement-1',
  name: 'API Calls',
  slug: 'api-calls',
  type: 'NUMBER',
  unitPlural: 'calls',
  unitSingular: 'call',
  updatedAt: '2026-03-01T09:00:00.000Z',
  userFacing: false,
} as Entitlement;

let stored: Entitlement;
let updates: Array<{ body: unknown; entitlementSlug: string }>;
let queryClient: QueryClient;

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
  navigate.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetEntitlement(() => HttpResponse.json(stored)),
    handleListEntitlements({ body: { hasMore: false, items: [] } }),
    handleUpdateEntitlement(async ({ params, request }) => {
      updates.push({
        body: await request.json(),
        entitlementSlug: params.entitlementSlug,
      });

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const submit = (changes: Record<string, unknown>) =>
  act(() =>
    captured.options.onSubmit({
      value: { ...captured.options.defaultValues, ...changes },
    }),
  );

describe('the form that edits an entitlement', () => {
  it('sends the fields that were changed on top of the entitlement as the API holds it now', async () => {
    renderHook(() => useEntitlementMutationForm(opened), { wrapper });
    // Another tab changed the icon and put the entitlement in a group.
    stored = {
      ...opened,
      entitlementGroups: [
        { id: 'group-usage', name: 'Usage', slug: 'usage' },
        { id: 'group-billing', name: 'Billing', slug: 'billing' },
      ],
      icon: 'lucide:bolt',
    } as Entitlement;

    await submit({ description: 'Count API calls' });

    expect(updates).toEqual([
      {
        body: expect.objectContaining({
          description: 'Count API calls',
          groupSlugs: ['usage', 'billing'],
          icon: 'lucide:bolt',
          name: 'API Calls',
        }),
        entitlementSlug: 'api-calls',
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith(
      'Pages.Entitlements.Mutation.Form.updateSuccess',
    );
  });

  it('says the entitlement is gone when it was deleted meanwhile, and writes nothing', async () => {
    renderHook(() => useEntitlementMutationForm(opened), { wrapper });
    server.use(
      handleGetEntitlement(() =>
        HttpResponse.json(
          { detail: 'The entitlement does not exist', status: 404 },
          { status: 404 },
        ),
      ),
    );

    await submit({ description: 'Count API calls' });

    expect(updates).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('The entitlement does not exist');
    expect(toast.success).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
