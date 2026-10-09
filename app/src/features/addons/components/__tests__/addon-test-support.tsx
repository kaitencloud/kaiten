import { Suspense } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type {
  Addon,
  AddonEntitlement,
  Entitlement,
  LicenseFamilyView,
} from '@/api-client';
import { renderWithClient } from '@/test-fixtures/billing-test-support';
import {
  buildAddon,
  buildAddonGrant,
  buildEntitlement,
} from '../../../../../e2e/app/_support/fixtures';

/**
 * What the tests of the add-on screens share: the versions and entitlements they are
 * read over, and the render that gives them what the console gives a route: a client, a
 * Suspense boundary for the reads the route has loaded in the console, and plain links.
 */

export const SEATS = buildEntitlement({
  name: 'Seats',
  slug: 'seats',
  unit: { plural: 'seats', singular: 'seat' },
});
export const API_CALLS = buildEntitlement({
  name: 'API Calls',
  resetPeriod: 'MONTH',
  slug: 'api-calls',
});
export const ANALYTICS = buildEntitlement({
  name: 'Advanced Analytics',
  slug: 'advanced-analytics',
  type: 'BOOLEAN',
});
export const ENTITLEMENTS: Entitlement[] = [SEATS, API_CALLS, ANALYTICS];

/** The next version of the seats: a draft nobody holds, which can still be changed. */
export const SEATS_DRAFT: Addon = buildAddon({
  description: 'Five more named users a unit',
  familySlug: 'extra-seats',
  lifecycleState: 'DRAFT',
  maxQuantity: 10,
  name: 'Extra seats',
  slug: 'extra-seats-v2',
  version: 2,
  versionName: '2027',
});
/** The version on sale: the default of its family. */
export const SEATS_V1: Addon = buildAddon({
  familySlug: 'extra-seats',
  isDefault: true,
  maxQuantity: 10,
  name: 'Extra seats',
  slug: 'extra-seats',
  versionName: '2026',
});
export const STORAGE_ARCHIVED: Addon = buildAddon({
  familySlug: 'extra-storage',
  lifecycleState: 'ARCHIVED',
  name: 'Extra storage',
  slug: 'extra-storage',
  versionName: '2025',
});

export const seatsGrant = (addonSlug = SEATS_DRAFT.slug): AddonEntitlement =>
  buildAddonGrant({
    addonSlug,
    behavior: 'ADD',
    entitlementSlug: 'seats',
    value: 5,
  });

export const licenseFamily = (
  slug: string,
  currentVersion?: LicenseFamilyView['currentVersion'],
): LicenseFamilyView => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  currentVersion,
  id: `family-${slug}`,
  isPublic: false,
  slug,
  updatedAt: '2026-01-01T00:00:00.000Z',
  versionCount: 1,
});

/** The router the screens read, over plain anchors: the links, and the redirect that leaves a dialog the URL cannot open. */
export function createAddonRouterModule(navigate: (options: unknown) => void) {
  return {
    Link: ({
      children,
      params,
      search,
      to,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      params?: Record<string, string>;
      search?: Record<string, string | undefined>;
      to: string;
    }) => {
      const path = Object.entries(params ?? {}).reduce(
        (result, [name, value]) => result.replace(`$${name}`, value),
        to,
      );
      const query = new URLSearchParams(
        Object.entries(search ?? {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ).toString();

      return (
        <a {...props} href={query ? `${path}?${query}` : path}>
          {children}
        </a>
      );
    },
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="left" data-to={to} />
    ),
    useNavigate: () => navigate,
    useRouter: () => ({
      buildLocation: ({
        params,
        to,
      }: {
        params?: Record<string, string>;
        to: string;
      }) => ({
        pathname: Object.entries(params ?? {}).reduce(
          (result, [name, value]) => result.replace(`$${name}`, value),
          to,
        ),
      }),
    }),
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: '/catalog/addons/extra-seats-v2' } }),
  };
}

export function renderScreen(ui: ReactNode) {
  return renderWithClient(<Suspense fallback={null}>{ui}</Suspense>);
}
