import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Component } from '@/api-client';
import {
  handleGetComponent,
  handleListComponents,
  handleUpdateComponent,
} from '@/api-client/msw.gen';
// For its side effect: the REST client then throws an `ApiError`, which carries the
// words of the API's refusal.
import '@/lib/api/bootstrap';
import { useComponentForm } from '../use-component-form';

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
  description: 'The public API',
  id: 'component-1',
  name: 'API Gateway',
  slug: 'api-gateway',
  version: 'v1.0.0',
} as Component;

let stored: Component;
let updates: Array<{ body: unknown; componentSlug: string }>;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const renderForm = () => {
  const onSuccess = vi.fn();
  renderHook(
    () =>
      useComponentForm({
        componentSlug: 'api-gateway',
        initialValues: {
          description: opened.description,
          name: opened.name,
          slug: opened.slug,
          version: opened.version,
        },
        mode: 'edit',
        onSuccess,
      }),
    { wrapper },
  );

  return onSuccess;
};

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  toast.error.mockReset();
  toast.success.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetComponent(() => HttpResponse.json(stored)),
    handleListComponents({ body: { hasMore: false, items: [] } }),
    handleUpdateComponent(async ({ params, request }) => {
      updates.push({
        body: await request.json(),
        componentSlug: params.componentSlug,
      });

      return HttpResponse.json(stored);
    }),
  );
});

describe('the form that edits a component', () => {
  it('sends the fields that were changed on top of the component as the API holds it now', async () => {
    const onSuccess = renderForm();
    // Another tab rewrote the description after the dialog opened.
    stored = { ...opened, description: 'Edited in another tab' };

    await act(() =>
      captured.options.onSubmit({
        value: { ...captured.options.defaultValues, version: 'v1.1.0' },
      }),
    );

    expect(updates).toEqual([
      {
        body: {
          description: 'Edited in another tab',
          name: 'API Gateway',
          version: 'v1.1.0',
        },
        componentSlug: 'api-gateway',
      },
    ]);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('says the component is gone when it was deleted meanwhile, and writes nothing', async () => {
    const onSuccess = renderForm();
    server.use(
      handleGetComponent(() =>
        HttpResponse.json(
          { detail: 'The component does not exist', status: 404 },
          { status: 404 },
        ),
      ),
    );

    await act(() =>
      captured.options.onSubmit({
        value: { ...captured.options.defaultValues, version: 'v1.1.0' },
      }),
    );

    expect(updates).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('The component does not exist');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
