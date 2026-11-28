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

// A combined entitlement (usageSource COMBINED_USAGE) sums other entitlements, its sources.
// It is a SUM that takes the window its sources share, which the API derives and refuses a
// value that is not theirs: the form sends none, on creation and on every edit, and nothing
// of a threshold, since nothing crosses on a sum.
describe('the form of a combined entitlement', () => {
  const credits = {
    ...opened,
    description: 'The credits a customer reads',
    id: 'entitlement-credits',
    name: 'Credits',
    resetAnchor: 'CALENDAR',
    resetPeriod: 'MONTH',
    slug: 'credits',
    sources: [
      { entitlementSlug: 'ai-credits', weight: '0.6' },
      { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
    ],
    usageSource: 'COMBINED_USAGE',
    warningThresholdPercent: 0,
  } as Entitlement;
  const sources = [
    { entitlementSlug: 'firecrawl-credits', weight: '0.40' },
    { entitlementSlug: 'ai-credits', weight: '0.6' },
  ];

  it('creates it with its sources and the usage source, and sends no window, no threshold and nothing but a sum', async () => {
    const created: unknown[] = [];
    server.use(
      handleCreateEntitlement(async ({ request }) => {
        created.push(await request.json());

        return HttpResponse.json(credits, { status: 201 });
      }),
    );
    const onSuccess = vi.fn();
    renderHook(() => useEntitlementMutationForm(undefined, onSuccess), {
      wrapper,
    });

    await submit({
      aggregationMethod: 'AVERAGE',
      name: 'Credits',
      resetAnchor: 'LICENSE_START',
      resetPeriod: 'MONTH',
      sources,
      type: 'NUMBER',
      usageSource: 'COMBINED_USAGE',
      warningThresholdPercent: 50,
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      aggregationMethod: 'SUM',
      name: 'Credits',
      // As the API writes a weight back: 0.40 is 0.4.
      sources: [
        { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
        { entitlementSlug: 'ai-credits', weight: '0.6' },
      ],
      type: 'NUMBER',
      usageSource: 'COMBINED_USAGE',
    });
    for (const member of [
      'resetPeriod',
      'resetAnchor',
      'warningThresholdPercent',
    ]) {
      expect(created[0]).not.toHaveProperty(member);
    }
    expect(onSuccess).toHaveBeenCalledWith(credits);
  });

  it('creates a calculated number as calculated, with no source, even if lines were left on the form', async () => {
    const created: unknown[] = [];
    server.use(
      handleCreateEntitlement(async ({ request }) => {
        created.push(await request.json());

        return HttpResponse.json(opened, { status: 201 });
      }),
    );
    renderHook(() => useEntitlementMutationForm(undefined, vi.fn()), {
      wrapper,
    });

    await submit({
      name: 'API Calls',
      sources,
      type: 'NUMBER',
      usageSource: 'CALCULATED_USAGE',
    });

    expect(created[0]).toMatchObject({ usageSource: 'CALCULATED_USAGE' });
    expect(created[0]).not.toHaveProperty('sources');
  });

  it.each([
    ['a flag', 'BOOLEAN'],
    ['a configuration', 'CONFIG'],
  ] as const)(
    'says nothing of where the usage of %s comes from, which the API refuses (400)',
    async (_name, type) => {
      const created: unknown[] = [];
      server.use(
        handleCreateEntitlement(async ({ request }) => {
          created.push(await request.json());

          return HttpResponse.json(opened, { status: 201 });
        }),
      );
      renderHook(() => useEntitlementMutationForm(undefined, vi.fn()), {
        wrapper,
      });

      await submit({ name: 'Support', type, usageSource: 'COMBINED_USAGE' });

      expect(created[0]).not.toHaveProperty('usageSource');
      expect(created[0]).not.toHaveProperty('sources');
    },
  );

  it('does not let a credit pool be combined, which a type changed on the form would leave behind', async () => {
    setAiAccessInputsForTest(queryClient, { capability: true, flag: true });
    const created: unknown[] = [];
    server.use(
      handleCreateEntitlement(async ({ request }) => {
        created.push(await request.json());

        return HttpResponse.json(opened, { status: 201 });
      }),
    );
    renderHook(() => useEntitlementMutationForm(undefined, vi.fn()), {
      wrapper,
    });

    await submit({
      name: 'Pool',
      sources,
      type: 'NUMBER_AI_CREDIT',
      usageSource: 'COMBINED_USAGE',
    });

    expect(created[0]).toMatchObject({ usageSource: 'CALCULATED_USAGE' });
    expect(created[0]).not.toHaveProperty('sources');
  });

  it('sends the new sources of an edit on top of the entitlement as the API holds it, and no window, which the sources may have moved', async () => {
    stored = credits;
    renderHook(() => useEntitlementMutationForm(credits), { wrapper });

    await submit({
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.5' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.5' },
      ],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].entitlementSlug).toBe('credits');
    expect(updates[0].body).toMatchObject({
      aggregationMethod: 'SUM',
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.5' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.5' },
      ],
      usageSource: 'COMBINED_USAGE',
    });
    for (const member of ['resetPeriod', 'resetAnchor']) {
      expect(updates[0].body).not.toHaveProperty(member);
    }
  });

  it('keeps the sources that another tab saved when the edit is about something else', async () => {
    renderHook(() => useEntitlementMutationForm(credits), { wrapper });
    // The weights were changed elsewhere since the form opened.
    stored = {
      ...credits,
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.9' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.1' },
      ],
    };

    await submit({ description: 'Another description' });

    expect(updates[0].body).toMatchObject({
      description: 'Another description',
      sources: [
        { entitlementSlug: 'ai-credits', weight: '0.9' },
        { entitlementSlug: 'firecrawl-credits', weight: '0.1' },
      ],
    });
  });

  // A refusal about what the person chose is shown on the sources, in the words of the console,
  // and not in a toast with the English of the API.
  it.each([
    ['UpdateEntitlement.SourceWindowMismatch', 'sourceWindowMismatch'],
    ['UpdateEntitlement.CombinedWindowMismatch', 'sourceWindowMismatch'],
    ['UpdateEntitlement.SourceIsCombined', 'sourceIsCombined'],
    [
      'UpdateEntitlement.SourceUnsupportedAggregation',
      'sourceUnsupportedAggregation',
    ],
    ['UpdateEntitlement.SourceUnsupportedType', 'sourceUnsupportedType'],
    ['UpdateEntitlement.SourceNotFound', 'sourceNotFound'],
  ] as const)(
    'shows the refusal %s on the sources',
    async (code, sentence) => {
      stored = credits;
      renderHook(() => useEntitlementMutationForm(credits), { wrapper });
      server.use(
        handleUpdateEntitlement(() =>
          HttpResponse.json(
            { code, detail: 'The API says it in English', status: 422 },
            { status: 422 },
          ),
        ),
      );
      const setFieldMeta = vi.fn();
      const formApi = {
        getFieldMeta: () => ({}),
        getFieldValue: () => sources,
        setFieldMeta,
        store: { subscribe: () => ({ unsubscribe: vi.fn() }) },
      };

      await act(() =>
        captured.options.onSubmit({
          formApi,
          value: { ...captured.options.defaultValues, sources },
        }),
      );

      expect(setFieldMeta).toHaveBeenCalledWith('sources', expect.any(Function));
      const [, update] = setFieldMeta.mock.calls[0];
      expect(update({}).errorMap.onServer.message).toBe(
        `Pages.Entitlements.Mutation.Form.Refusals.${sentence}`,
      );
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it('says that an entitlement a combined one sums cannot take a reset cadence above the buttons', async () => {
    stored = opened;
    const { result } = renderHook(() => useEntitlementMutationForm(opened), {
      wrapper,
    });
    server.use(
      handleUpdateEntitlement(() =>
        HttpResponse.json(
          {
            code: 'UpdateEntitlement.SourceWindowLocked',
            detail: 'entitlement "api-calls" is a source of credits',
            status: 422,
          },
          { status: 422 },
        ),
      ),
    );
    const setFieldMeta = vi.fn();

    await act(() =>
      captured.options.onSubmit({
        formApi: { getFieldMeta: () => ({}), setFieldMeta },
        value: { ...captured.options.defaultValues, resetPeriod: 'MONTH' },
      }),
    );

    expect(result.current.refusal).toBe(
      'Pages.Entitlements.Mutation.Form.Refusals.sourceWindowLocked',
    );
    expect(setFieldMeta).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
