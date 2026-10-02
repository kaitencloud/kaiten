import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { handleUpdateEntitlement } from '@/api-client/msw.gen';
import { EntitlementGroupsInlineEditorCell } from '../entitlement-groups-inline-editor-cell';

vi.mock('../entitlement-group-selector', () => ({
  EntitlementGroupSelector: ({
    autoFocusSearch,
    interactionMode,
    onOpenChange,
    onSelectionResolvedChange,
    onChange,
    open,
    value,
  }: {
    autoFocusSearch?: boolean;
    interactionMode?: 'default' | 'inline';
    onOpenChange?: (nextOpen: boolean) => void;
    onSelectionResolvedChange?: (
      groups: Array<{ name: string; slug: string }>,
    ) => void;
    onChange: (groupSlugs: string[]) => void;
    open?: boolean;
    value?: string[];
  }) => (
    <button
      type="button"
      data-autofocus-search={autoFocusSearch ? 'true' : 'false'}
      data-interaction-mode={interactionMode ?? 'default'}
      data-open={open ? 'true' : 'false'}
      onClick={() => {
        onSelectionResolvedChange?.([
          { name: 'Usage', slug: 'usage' },
          { name: 'Billing', slug: 'billing' },
        ]);
        onChange([...(value ?? []), 'billing']);
        onOpenChange?.(false);
      }}
    >
      Edit groups
    </button>
  ),
}));

describe('EntitlementGroupsInlineEditorCell', () => {
  it('updates entitlement groups inline with the entitlement writable payload', async () => {
    const entitlement: Entitlement = {
      aggregationMethod: 'COUNT',
      createdAt: '2026-03-01T09:00:00.000Z',
      description: 'Track API calls',
      entitlementGroups: [{ id: 'group-usage', name: 'Usage', slug: 'usage' }],
      icon: 'lucide:zap',
      id: 'entitlement-1',
      name: 'API Calls',
      slug: 'api-calls',
      type: 'NUMBER',
      updatedAt: '2026-03-01T09:00:00.000Z',
      userFacing: true,
      displayOrder: 7,
      unitSingular: 'call',
      unitPlural: 'calls',
      saleUnitSingular: 'pack',
      saleUnitPlural: 'packs',
      saleUnitFactor: 100,
    };

    const updates: Array<{ entitlementSlug: string; body: unknown }> = [];
    server.use(
      handleUpdateEntitlement(async ({ params, request }) => {
        updates.push({
          entitlementSlug: params.entitlementSlug,
          body: await request.json(),
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <EntitlementGroupsInlineEditorCell entitlement={entitlement} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('button', { name: 'Usage' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Usage' }));

    expect(screen.getByRole('button', { name: 'Edit groups' })).toHaveAttribute(
      'data-autofocus-search',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Edit groups' })).toHaveAttribute(
      'data-open',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Edit groups' })).toHaveAttribute(
      'data-interaction-mode',
      'inline',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit groups' }));

    await waitFor(() => {
      // PUT is full-replace: the inline group edit must resend every writable
      // field, otherwise icon/units/userFacing/displayOrder would be wiped.
      expect(updates).toEqual([
        {
          entitlementSlug: 'api-calls',
          body: {
            aggregationMethod: 'COUNT',
            description: 'Track API calls',
            groupSlugs: ['usage', 'billing'],
            icon: 'lucide:zap',
            name: 'API Calls',
            type: 'NUMBER',
            userFacing: true,
            displayOrder: 7,
            unitSingular: 'call',
            unitPlural: 'calls',
            saleUnitSingular: 'pack',
            saleUnitPlural: 'packs',
            saleUnitFactor: 100,
          },
        },
      ]);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Edit groups' }),
      ).not.toBeInTheDocument();
    });
  });
});
