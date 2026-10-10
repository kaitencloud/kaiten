import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleGetLicenses,
  handleListAddons,
  handleListCustomers,
  handleListEntitlements,
} from '@/api-client/msw.gen';
import {
  createLoadedPageClient,
  pageOf,
  refusal,
  sessionToken,
} from '@/test-fixtures/billing-test-support';
import { grantedScopesQueryOptions } from '@/lib/granted-scopes';
import { ALL_SCOPES } from '../../components/__tests__/voucher-test-support';
import { voucherCustomersQueryOptions } from '../../queries';
import { useVoucherReferences } from '../use-voucher-references';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken([...ALL_SCOPES]));
});

/** Mounts the hook on a cache whose customers read was refused, as a loader leaves it. */
async function mountAfterRefusedCustomers(startedByLoader: boolean) {
  const client = createLoadedPageClient();
  let customerReads = 0;
  server.use(
    handleListCustomers(() => {
      customerReads += 1;

      return refusal(403, { code: 'Auth.MissingScope', detail: 'read' });
    }),
    handleGetLicenses(() => HttpResponse.json(pageOf([]))),
    handleListAddons(() => HttpResponse.json([])),
    handleListEntitlements(() => HttpResponse.json(pageOf([]))),
  );
  // The loader read the scopes first, so the hook knows at once what it may read.
  await client.prefetchQuery(grantedScopesQueryOptions);
  await client.prefetchQuery(voucherCustomersQueryOptions());
  expect(customerReads).toBe(1);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useVoucherReferences({ startedByLoader }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.licenses.status).toBe('success'));

  return { customerReads: () => customerReads, result };
}

describe('useVoucherReferences', () => {
  it('shows the refusal a loader met instead of asking once more, for the wizard', async () => {
    const { customerReads, result } = await mountAfterRefusedCustomers(true);

    expect(customerReads()).toBe(1);
    expect(result.current.customers.status).toBe('error');
  });

  it('asks again when it mounts on a failed read nobody started, as the voucher page does', async () => {
    const { customerReads } = await mountAfterRefusedCustomers(false);

    await waitFor(() => expect(customerReads()).toBe(2));
  });
});
