import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
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
import { EntitlementIconDialog } from '../entitlement-icon-dialog';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      typeof fallback === 'string' ? fallback : key,
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), track: vi.fn(), warn: vi.fn() },
}));
// The grid has its own tests: here it only has to pick an icon.
vi.mock('@/components/ui/icon-picker', () => ({
  IconPickerGrid: ({ onSelect }: { onSelect: (token: string) => void }) => (
    <button onClick={() => onSelect('lucide:star')} type="button">
      Pick the star
    </button>
  ),
}));

const opened = {
  createdAt: '2026-03-01T09:00:00.000Z',
  description: 'Track API calls',
  displayOrder: 0,
  icon: 'lucide:zap',
  id: 'entitlement-1',
  name: 'API Calls',
  slug: 'api-calls',
  type: 'BOOLEAN',
  updatedAt: '2026-03-01T09:00:00.000Z',
  userFacing: false,
} as Entitlement;

let stored: Entitlement;
let updates: unknown[];

beforeEach(() => {
  toast.error.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetEntitlement(() => HttpResponse.json(stored)),
    handleListEntitlements({ body: { hasMore: false, items: [] } }),
    handleUpdateEntitlement(async ({ request }) => {
      updates.push(await request.json());

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const renderDialog = () => {
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            mutations: { retry: false },
            queries: { retry: false },
          },
        })
      }
    >
      <EntitlementIconDialog
        entitlement={opened}
        onOpenChange={onOpenChange}
        open
      />
    </QueryClientProvider>,
  );

  return onOpenChange;
};

describe('choosing the icon of an entitlement', () => {
  it('puts the icon on top of the entitlement as the API holds it now', async () => {
    const onOpenChange = renderDialog();
    // Another tab renamed the entitlement after the page loaded.
    stored = { ...opened, name: 'API Calls (renamed)' };

    await userEvent.click(
      await screen.findByRole('button', { name: 'Pick the star' }),
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(updates).toEqual([
      expect.objectContaining({
        icon: 'lucide:star',
        name: 'API Calls (renamed)',
      }),
    ]);
  });

  it('says the entitlement is gone when it was deleted meanwhile, and writes nothing', async () => {
    const onOpenChange = renderDialog();
    server.use(
      handleGetEntitlement(() =>
        HttpResponse.json(
          { detail: 'The entitlement does not exist', status: 404 },
          { status: 404 },
        ),
      ),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Pick the star' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The entitlement does not exist',
      ),
    );
    expect(updates).toEqual([]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
