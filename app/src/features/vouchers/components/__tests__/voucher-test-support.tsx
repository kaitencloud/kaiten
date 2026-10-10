import { HttpResponse } from 'msw';
import { Suspense } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { server } from '@/__tests__/msw-server';
import type { Addon, Customer, Entitlement, License } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetLicenses,
  handleListAddons,
  handleListCustomers,
  handleListEntitlements,
} from '@/api-client/msw.gen';
import {
  pageOf,
  renderWithClient,
  sessionToken,
} from '@/test-fixtures/billing-test-support';
import { buildEntitlement } from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';

/**
 * What the tests of the voucher screens share: the router they read over plain anchors, the
 * session they hold, and what the wizard reads of the organization to name and offer what a
 * voucher refers to (its customers, its licenses, its add-ons and its entitlements).
 */

/** Every scope the voucher screens ask, for a session that may do it all. */
export const ALL_SCOPES = [
  'read:billing',
  'read:vouchers',
  'write:vouchers',
  'read:voucher_redemptions',
  'write:voucher_redemptions',
  'read:customers',
  'read:licenses',
  'read:addons',
  'read:entitlements',
  'read:instances',
] as const;

export const TOKENS = buildEntitlement({
  name: 'Tokens',
  slug: 'tokens',
  type: 'NUMBER',
});
export const CREDITS = buildEntitlement({
  name: 'AI credits',
  slug: 'ai-credits',
  type: 'NUMBER_AI_CREDIT',
});
export const SSO = buildEntitlement({
  name: 'SSO',
  slug: 'sso',
  type: 'BOOLEAN',
});
export const THEME = buildEntitlement({
  name: 'Theme',
  slug: 'theme',
  type: 'CONFIG',
});

const CUSTOMERS = [
  { id: 'c-1', name: 'Hooli', slug: 'hooli' },
  { id: 'c-2', name: 'Initech', slug: 'initech' },
] as unknown as Customer[];

const LICENSES = [
  {
    id: 'license-pro',
    lifecycleState: 'PUBLISHED',
    name: 'Pro',
    slug: 'pro-v2',
    version: 2,
  },
] as unknown as License[];

/** Serves what the wizard reads of the organization. A list left out is the default one. */
export function serveReferences({
  addons = [],
  customers = CUSTOMERS,
  entitlements = [TOKENS, CREDITS, SSO, THEME],
  licenses = LICENSES,
}: {
  addons?: Addon[];
  customers?: Customer[];
  entitlements?: Entitlement[];
  licenses?: License[];
} = {}) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithVouchers(),
    }),
    handleListCustomers(() => HttpResponse.json(pageOf(customers))),
    handleGetLicenses(() => HttpResponse.json(pageOf(licenses))),
    handleListAddons(() => HttpResponse.json(pageOf(addons))),
    handleListEntitlements(() => HttpResponse.json(pageOf(entitlements))),
  );
}

const resolve = (
  to: string,
  params: Record<string, string> | undefined,
  search: unknown,
) => {
  const path = Object.entries(params ?? {}).reduce(
    (result, [name, value]) => result.replace(`$${name}`, value),
    to,
  );
  const entries = Object.entries(
    typeof search === 'function'
      ? (search as (previous: object) => object)({})
      : (search ?? {}),
  ).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  const query = new URLSearchParams(entries).toString();

  return query ? `${path}?${query}` : path;
};

/** The router the screens read, over plain anchors: the links, the paths a table builds and the navigation a test can watch. */
export function createVoucherRouterModule(
  navigate: (options: unknown) => void,
) {
  return {
    Link: ({
      children,
      params,
      search,
      to,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      params?: Record<string, string>;
      search?: unknown;
      to: string;
    }) => (
      <a {...props} href={resolve(to, params, search)}>
        {children}
      </a>
    ),
    useNavigate: () => navigate,
    useRouter: () => ({
      buildLocation: ({
        params,
        to,
      }: {
        params?: Record<string, string>;
        to: string;
      }) => ({ pathname: resolve(to, params, undefined) }),
    }),
  };
}

export const sessionWith = (scopes: readonly string[] = ALL_SCOPES) =>
  sessionToken([...scopes]);

export function renderScreen(ui: ReactNode) {
  return renderWithClient(<Suspense fallback={null}>{ui}</Suspense>);
}
