import type { QueryClient } from '@tanstack/react-query';
import { HttpResponse, type JsonBodyType } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleGetLicenses,
  handleGetVoucher,
  handleListAddons,
  handleListCustomers,
  handleListEntitlements,
} from '@/api-client/msw.gen';
import { addonVersionsQueryOptions } from '@/domains/billing';
import {
  createTestClient,
  pageOf,
  refusal,
  sessionToken,
} from '@/test-fixtures/billing-test-support';
import { buildVoucher } from '../../../../../e2e/app/_support/fixtures';
import { ALL_SCOPES } from '../../components/__tests__/voucher-test-support';
import {
  voucherCustomersQueryOptions,
  voucherEntitlementsQueryOptions,
  voucherLicensesQueryOptions,
  warmVoucherReferences,
} from '../voucher-reference-query-options';
import { loadVoucherWizard } from '../voucher-wizard-loader';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));

// What the wizard's pickers read, and the cache keys they read it under.
const keys = (client: QueryClient) => ({
  addons: client.getQueryState(addonVersionsQueryOptions().queryKey),
  customers: client.getQueryState(voucherCustomersQueryOptions().queryKey),
  entitlements: client.getQueryState(
    voucherEntitlementsQueryOptions().queryKey,
  ),
  licenses: client.getQueryState(voucherLicensesQueryOptions().queryKey),
});

/** Serves the four lists, and records which were asked and when they may answer. */
function serveReferences() {
  const asked: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const answer = (name: string, body: JsonBodyType) => async () => {
    asked.push(name);
    await gate;

    return HttpResponse.json(body);
  };
  server.use(
    handleListCustomers(answer('customers', pageOf([]))),
    handleGetLicenses(answer('licenses', pageOf([]))),
    handleListAddons(answer('addons', [])),
    handleListEntitlements(answer('entitlements', pageOf([]))),
  );

  return { asked, release };
}

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken([...ALL_SCOPES]));
});

describe('loadVoucherWizard', () => {
  it('starts the reads of the pickers and opens a new voucher without waiting for them', async () => {
    const client = createTestClient();
    const { asked, release } = serveReferences();

    await expect(loadVoucherWizard(client, undefined)).resolves.toBeUndefined();

    await vi.waitFor(() =>
      expect([...asked].sort()).toEqual([
        'addons',
        'customers',
        'entitlements',
        'licenses',
      ]),
    );
    expect(keys(client).customers?.status).toBe('pending');

    release();
    await vi.waitFor(() =>
      expect(Object.values(keys(client)).map((state) => state?.status)).toEqual(
        ['success', 'success', 'success', 'success'],
      ),
    );
  });

  it('waits for them to open a boost, which opens on the offer step, and gives back the discount it goes with', async () => {
    const client = createTestClient();
    const { release } = serveReferences();
    server.use(
      handleGetVoucher(() =>
        HttpResponse.json(buildVoucher({
            code: 'WELCOME-20-OFF-2027',
            id: 'voucher-1',
            name: 'Welcome',
          })),
      ),
    );
    let settled = false;

    const loading = loadVoucherWizard(client, 'voucher-1').then((voucher) => {
      settled = true;

      return voucher;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);

    release();

    await expect(loading).resolves.toMatchObject({ id: 'voucher-1' });
    expect(keys(client).licenses?.status).toBe('success');
    expect(keys(client).entitlements?.status).toBe('success');
  });
});

describe('warmVoucherReferences', () => {
  it('asks only for what the scopes of the session read, as the pickers do', async () => {
    getAuthToken.mockResolvedValue(
      sessionToken(['read:licenses', 'read:addons']),
    );
    const client = createTestClient();
    const { asked, release } = serveReferences();
    release();

    await warmVoucherReferences(client);

    expect([...asked].sort()).toEqual(['addons', 'licenses']);
  });

  it('does not throw at a refusal: the picker it leaves short shows it', async () => {
    const client = createTestClient();
    server.use(
      handleGetLicenses(() =>
        refusal(403, { code: 'Auth.MissingScope', detail: 'read:licenses' }),
      ),
      handleListCustomers(() => HttpResponse.json(pageOf([]))),
      handleListAddons(() => HttpResponse.json([])),
      handleListEntitlements(() => HttpResponse.json(pageOf([]))),
    );

    await expect(warmVoucherReferences(client)).resolves.toBeUndefined();

    expect(keys(client).licenses?.status).toBe('error');
    expect(keys(client).customers?.status).toBe('success');
  });
});
