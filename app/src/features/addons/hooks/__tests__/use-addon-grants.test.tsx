import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import { type ReactNode, Suspense } from 'react';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Addon, Entitlement } from '@/api-client';
import {
  handleGetAddon,
  handleListAddonEntitlements,
  handleListEntitlements,
} from '@/api-client/msw.gen';
import { setAiAccessInputsForTest } from '@/test-fixtures/ai-access';
import { buildEntitlement } from '../../../../../e2e/app/_support/fixtures';
import { useAddonGrants } from '../use-addon-grants';

// What an add-on version grants, and what it can still be given: the entitlements of the catalogue
// it does not grant yet. A combined entitlement is the weighted sum of its sources, computed when it
// is read, so an add-on grants the sources and the sum follows: the API refuses a grant of the sum.

const addon = { name: 'Extra credits', slug: 'extra-credits-v1' } as Addon;
const firecrawl = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Firecrawl Credits',
  slug: 'firecrawl-credits',
});
const ai = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'AI Credits',
  slug: 'ai-credits',
});
const credits: Entitlement = {
  ...buildEntitlement({
    aggregationMethod: 'SUM',
    name: 'Credits',
    slug: 'credits',
  }),
  sources: [
    { entitlementSlug: 'ai-credits', weight: '0.6' },
    { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
  ],
  usageSource: 'COMBINED_USAGE',
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>{children}</Suspense>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  setAiAccessInputsForTest(queryClient, { capability: false, flag: false });
  server.use(
    handleGetAddon(() => HttpResponse.json(addon)),
    handleListAddonEntitlements(() =>
      HttpResponse.json([
        {
          entitlementSlug: 'firecrawl-credits',
          entitlementType: 'NUMBER',
          overrideBehavior: 'ADD',
          value: { type: 'number', value: 100 },
        },
      ]),
    ),
    handleListEntitlements(() =>
      HttpResponse.json({
        hasMore: false,
        items: [firecrawl, ai, credits],
      }),
    ),
  );
});

describe('the entitlements a version can still be given', () => {
  it('are those of the catalogue it does not grant yet, and never a combined one, which is computed from the sources it grants', async () => {
    const { result } = renderHook(() => useAddonGrants('extra-credits-v1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current.available.map(({ slug }) => slug)).toEqual([
      'ai-credits',
    ]);
    // The catalogue still names the sum, which a grant of its source does not hide.
    expect(result.current.entitlementBySlug.get('credits')?.name).toBe(
      'Credits',
    );
  });
});
