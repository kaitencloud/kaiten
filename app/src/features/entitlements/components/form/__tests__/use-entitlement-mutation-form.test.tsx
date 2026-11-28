import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import {
  handleCreateEntitlement,
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
let created: unknown[];
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
  created = [];
  updates = [];
  server.use(
    handleCreateEntitlement(async ({ request }) => {
      created.push(await request.json());

      return HttpResponse.json({ ...opened, slug: 'created' }, { status: 201 });
    }),
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

  it('sends the units of an AI credit entitlement along with an edit that does not touch them', async () => {
    setAiAccessInputsForTest(queryClient, { capability: true, flag: true });
    const credits = {
      ...opened,
      aggregationMethod: 'SUM',
      saleUnitFactor: 100,
      saleUnitPlural: 'packs',
      saleUnitSingular: 'pack',
      slug: 'ai-credits',
      type: 'NUMBER_AI_CREDIT',
      unitPlural: 'credits',
      unitSingular: 'credit',
    } as Entitlement;
    stored = credits;
    renderHook(() => useEntitlementMutationForm(credits), { wrapper });

    await submit({ description: 'Credits of the assistant' });

    expect(updates).toEqual([
      {
        body: expect.objectContaining({
          description: 'Credits of the assistant',
          saleUnitFactor: 100,
          saleUnitPlural: 'packs',
          saleUnitSingular: 'pack',
          unitPlural: 'credits',
          unitSingular: 'credit',
        }),
        entitlementSlug: 'ai-credits',
      },
    ]);
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

  it('says a refusal about a read-only pair above the buttons, in the words of the console, and clears it on the next send', async () => {
    const { result } = renderHook(() => useEntitlementMutationForm(opened), {
      wrapper,
    });
    const setFieldMeta = vi.fn();
    let refuse = true;
    server.use(
      handleUpdateEntitlement(() =>
        refuse
          ? HttpResponse.json(
              {
                code: 'UpdateEntitlement.ImmutableResetAnchor',
                detail: 'resetAnchor cannot be changed once set',
                status: 400,
                title: 'Bad Request',
              },
              { status: 400 },
            )
          : new HttpResponse(null, { status: 204 }),
      ),
    );

    await act(() =>
      captured.options.onSubmit({
        formApi: { getFieldMeta: () => ({}), setFieldMeta },
        value: { ...captured.options.defaultValues, description: 'Changed' },
      }),
    );

    expect(result.current.refusal).toBe(
      'Pages.Entitlements.Mutation.Form.Refusals.immutableResetAnchor',
    );
    // Not on a field: the field is read-only, and nothing to edit would mend it.
    expect(setFieldMeta).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    refuse = false;
    await act(() =>
      captured.options.onSubmit({
        formApi: { getFieldMeta: () => ({}), setFieldMeta },
        value: { ...captured.options.defaultValues, description: 'Changed' },
      }),
    );

    expect(result.current.refusal).toBeNull();
  });
});

// What the limit applies to is chosen once, for a NUMBER, and is nobody else's: the API refuses a
// scope on a Boolean or a Config entitlement (400), and an AI credit pool is one balance per instance.
describe('what the form sends of what the limit applies to', () => {
  it('sends the choice of a creation: one counter for each resource', async () => {
    renderHook(() => useEntitlementMutationForm(), { wrapper });

    await submit({ limitScope: 'RESOURCE', name: 'Sources per competitor' });

    expect(created).toEqual([
      expect.objectContaining({
        limitScope: 'RESOURCE',
        name: 'Sources per competitor',
        type: 'NUMBER',
      }),
    ]);
  });

  it('sends the default of the form, one counter for each instance, when nothing was chosen', async () => {
    renderHook(() => useEntitlementMutationForm(), { wrapper });

    await submit({ name: 'API calls' });

    expect(created).toEqual([expect.objectContaining({ limitScope: 'INSTANCE' })]);
  });

  it.each(['BOOLEAN', 'CONFIG'] as const)(
    'leaves the choice behind when the type moved to %s after it was made',
    async (type) => {
      renderHook(() => useEntitlementMutationForm(), { wrapper });

      await submit({
        aggregationMethod: undefined,
        limitScope: 'RESOURCE',
        name: 'A flag',
        type,
      });

      expect(created).toHaveLength(1);
      expect(created[0]).not.toHaveProperty('limitScope');
    },
  );

  it('leaves it out for an AI credit pool, which counts per instance', async () => {
    setAiAccessInputsForTest(queryClient, { capability: true, flag: true });
    renderHook(() => useEntitlementMutationForm(), { wrapper });

    await submit({
      limitScope: 'RESOURCE',
      name: 'Credits',
      type: 'NUMBER_AI_CREDIT',
    });

    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty('limitScope');
  });

  it('echoes what an edit leaves alone, which cannot change, so the PUT is never read as a change of it', async () => {
    const perResource = { ...opened, limitScope: 'RESOURCE' } as Entitlement;
    stored = perResource;
    renderHook(() => useEntitlementMutationForm(perResource), { wrapper });

    await submit({ description: 'Sources followed for each competitor' });

    expect(updates).toEqual([
      {
        body: expect.objectContaining({
          description: 'Sources followed for each competitor',
          limitScope: 'RESOURCE',
        }),
        entitlementSlug: 'api-calls',
      },
    ]);
  });

  it('has none to echo for an entitlement that has none', async () => {
    const flag = {
      ...opened,
      aggregationMethod: undefined,
      slug: 'sso',
      type: 'BOOLEAN',
    } as Entitlement;
    stored = flag;
    renderHook(() => useEntitlementMutationForm(flag), { wrapper });

    await submit({ description: 'Single sign-on' });

    expect(updates).toHaveLength(1);
    expect(updates[0].body).not.toHaveProperty('limitScope');
  });
});
