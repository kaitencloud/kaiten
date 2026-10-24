import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import {
  handleCreateEntitlement,
  handleListEntitlementGroups,
} from '@/api-client/msw.gen';
import '@/lib/api/bootstrap';
import en from '@/lib/i18n/locales/en';
import { EntitlementCreatePage } from '../entitlement-create-page';
import { EntitlementForm } from '../entitlement-form';

const navigate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => navigate,
  useRouteContext: () => ({}),
  useRouter: () => ({ navigate }),
}));
vi.mock('sonner', () => ({ toast }));

const STORAGE_KEY = 'kaiten:form-recovery';
const OFFER = 'Pick up where you left off?';

let created: unknown[];
let queryClient: QueryClient;

beforeEach(() => {
  testI18n.addResourceBundle(
    'en',
    'translation',
    {
      Common: en.Common,
      Functionals: { FormRecovery: en.Functionals.FormRecovery },
      Pages: { Entitlements: en.Pages.Entitlements },
    },
    true,
    true,
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'));
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');
  window.localStorage.clear();
  navigate.mockReset();
  toast.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  created = [];
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  server.use(
    handleListEntitlementGroups({ body: { hasMore: false, items: [] } }),
    handleCreateEntitlement(async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      created.push(body);

      return HttpResponse.json(
        {
          createdAt: '2026-10-23T10:00:00.000Z',
          description: '',
          id: 'entitlement-1',
          name: body.name,
          slug: 'storage-reads',
          type: 'NUMBER',
          updatedAt: '2026-10-23T10:00:00.000Z',
          ...body,
        },
        { status: 201 },
      );
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const user = () =>
  userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

/** Lets the debounce of a second elapse, and the promises behind it settle. */
const elapse = (ms = 1_100) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const stored = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const blob = raw ? (JSON.parse(raw) as Record<string, { data: object }>) : {};

  return Object.values(blob).map(({ data }) => data as Record<string, any>);
};

const page = (onSuccess = vi.fn()) => (
  <QueryClientProvider client={queryClient}>
    <EntitlementCreatePage onCancel={vi.fn()} onSuccess={onSuccess} />
  </QueryClientProvider>
);

const nameField = () => screen.getByLabelText(/^Name/);

describe('the creation page of an entitlement, and what it keeps', () => {
  it('offers back a half-filled creation: the values, and the step it was left on', async () => {
    const person = user();
    const first = render(page());
    await person.type(nameField(), 'Storage Reads');
    await person.type(screen.getByLabelText('Description'), 'Reads per period');
    await person.click(screen.getByRole('button', { name: 'Next' }));
    await person.type(screen.getByLabelText('Unit (singular)'), 'read');
    await person.type(screen.getByLabelText('Unit (plural)'), 'reads');
    await elapse();
    first.unmount();

    render(page());

    expect(await screen.findByText(OFFER)).toBeInTheDocument();
    expect(screen.getByText(/step 2 of 2 \(Type configuration\)/)).toBeInTheDocument();
    // Nothing is restored without the click.
    expect(screen.queryByLabelText('Unit (singular)')).not.toBeInTheDocument();

    await person.click(screen.getByRole('button', { name: 'Resume' }));

    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unit (singular)')).toHaveValue('read');
    expect(screen.getByLabelText('Unit (plural)')).toHaveValue('reads');
    await person.click(screen.getByRole('button', { name: 'Previous' }));
    expect(nameField()).toHaveValue('Storage Reads');
    expect(screen.getByLabelText('Description')).toHaveValue('Reads per period');
  });

  it('starts over on a blank form', async () => {
    const person = user();
    const first = render(page());
    await person.type(nameField(), 'Storage Reads');
    await elapse();
    first.unmount();

    render(page());
    await person.click(await screen.findByRole('button', { name: 'Start over' }));

    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
    expect(nameField()).toHaveValue('');
  });

  it('sends through the recovery: the creation is not offered again once the API accepted it', async () => {
    const person = user();
    const onSuccess = vi.fn();
    const first = render(page(onSuccess));
    await person.type(nameField(), 'Storage Reads');
    await person.click(screen.getByRole('button', { name: 'Next' }));
    await person.click(screen.getByRole('button', { name: 'Create Entitlement' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(created).toHaveLength(1);
    first.unmount();
    await elapse(3_000);

    render(page());
    await elapse();

    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
    expect(stored().map((record) => record.kind)).toEqual(['tombstone']);
  });

  it('keeps the input after a refusal', async () => {
    const person = user();
    server.use(
      handleCreateEntitlement(() =>
        HttpResponse.json(
          { status: 422, title: 'Unprocessable', type: 'about:blank' },
          { status: 422 },
        ),
      ),
    );
    const first = render(page());
    await person.type(nameField(), 'Storage Reads');
    await person.click(screen.getByRole('button', { name: 'Next' }));
    await person.click(screen.getByRole('button', { name: 'Create Entitlement' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    first.unmount();

    render(page());

    expect(await screen.findByText(OFFER)).toBeInTheDocument();
  });

  it('keeps no field out of the storage and no value other than what was typed', async () => {
    const person = user();
    const first = render(page());
    await person.type(nameField(), 'Storage Reads');
    await elapse();
    first.unmount();

    const [entry] = stored();
    expect(entry).toMatchObject({ kind: 'entry', formId: 'entitlements.create' });
    expect(entry!.payload).toBe('[["name","Storage Reads"]]');
  });
});

describe('the edit form of an entitlement', () => {
  const entitlement = {
    aggregationMethod: 'SUM',
    createdAt: '2026-03-01T09:00:00.000Z',
    description: 'Track API calls',
    id: 'entitlement-1',
    name: 'API Calls',
    slug: 'api-calls',
    type: 'NUMBER',
    updatedAt: '2026-03-01T09:00:00.000Z',
  } as Entitlement;

  it('reads and writes nothing, whatever is typed', async () => {
    const person = user();
    const edit = render(
      <QueryClientProvider client={queryClient}>
        <EntitlementForm entitlement={entitlement} onCancel={vi.fn()} />
      </QueryClientProvider>,
    );

    await person.clear(screen.getByLabelText('Description'));
    await person.type(screen.getByLabelText('Description'), 'Edited, not sent');
    await elapse(3_000);
    edit.unmount();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
  });
});
