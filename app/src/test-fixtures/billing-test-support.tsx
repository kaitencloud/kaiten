import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterAll, beforeAll } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import type { InvoiceSummary, QueuedInvoice } from '@/api-client';
import { TooltipProvider } from '@/components/ui/tooltip';
// For its side effect: the REST client then throws an `ApiError`, the status and
// the problem of a refusal, which is what the screens read the API's words from.
import '@/lib/api/bootstrap';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';

/**
 * The real English and French texts for the test file that calls it: the i18n
 * instance of the unit tests holds none, and answers a key with itself.
 */
export function useBillingTexts() {
  beforeAll(async () => {
    testI18n.addResourceBundle('en', 'translation', en, true, true);
    testI18n.addResourceBundle('fr', 'translation', fr, true, true);
    await testI18n.changeLanguage('en');
  });

  afterAll(async () => {
    await testI18n.changeLanguage('en');
  });
}

const encode = (value: unknown) =>
  btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A session token that carries the given scopes: what the console reads its scopes from. */
export const sessionToken = (scopes: string[]) =>
  `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ scopes })}.signature`;

/** Where the page is, for the components that read it: the tabs of a route follow it. */
type MockLocation = { pathname: string; search?: Record<string, unknown> };

/**
 * The router a billing component reads, over plain anchors: links, the paths a
 * table builds for its rows, where the page is and the navigation a test can watch.
 */
export function createRouterModule(
  navigate: (options: unknown) => void,
  location: MockLocation = { pathname: '/' },
) {
  return {
    Link: ({
      activeOptions: _activeOptions,
      children,
      params,
      search,
      to,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      activeOptions?: unknown;
      params?: Record<string, string>;
      search?: Record<string, boolean | string | undefined>;
      to: string;
    }) => {
      const query = new URLSearchParams(
        Object.entries(search ?? {})
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      ).toString();
      // `$connectorId` in the path takes the value of `params.connectorId`.
      const path = Object.entries(params ?? {}).reduce(
        (result, [name, value]) => result.replace(`$${name}`, value),
        to,
      );

      return (
        <a {...props} href={query ? `${path}?${query}` : path}>
          {children}
        </a>
      );
    },
    useLocation: ({
      select,
    }: {
      select: (state: { pathname: string; search: object }) => unknown;
    }) =>
      select({ pathname: location.pathname, search: location.search ?? {} }),
    useNavigate: () => navigate,
    useRouter: () => ({
      buildLocation: ({
        params,
        to,
      }: {
        params: { invoiceId: string };
        to: string;
      }) => ({ pathname: to.replace('$invoiceId', params.invoiceId) }),
    }),
  };
}

/** The client of a page: no retry, so that a refusal is the answer and not the last of three. */
export const createTestClient = () =>
  new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

/**
 * The client of a page that a route loads, like the console's: what the loader read
 * is fresh for a while, so the page does not read it again when it mounts.
 */
export const createLoadedPageClient = () =>
  new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, staleTime: Infinity },
    },
  });

/** Renders under the providers a billing screen has in the console. */
export function renderWithClient(ui: ReactNode, client = createTestClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );

  return { client, ...render(ui, { wrapper }) };
}

/** What the API answers a refusal with: a problem document, with its status. */
export const refusal = (
  status: number,
  body: {
    code?: string;
    detail: string;
    errorId?: string;
    errors?: Array<{ location?: string; message?: string; value?: unknown }>;
  },
) => HttpResponse.json({ ...body, status }, { status });

const FIRST_INVOICE: Omit<InvoiceSummary, 'customerName' | 'id'> = {
  boundaryAt: '2027-03-01T00:00:00.000Z',
  collectionMethod: 'SEND_INVOICE',
  createdAt: '2027-03-01T00:00:00.000Z',
  currency: 'USD',
  customerSlug: 'customer',
  discountTotal: 0,
  handoffStatus: 'NOT_REQUIRED',
  instanceName: 'Production',
  instanceSlug: 'production',
  kind: 'RENEWAL',
  licenseSlug: 'pro',
  providerKind: 'NOOP',
  serviceFrom: '2027-02-01T00:00:00.000Z',
  serviceTo: '2027-03-01T00:00:00.000Z',
  status: 'PAID',
  subtotal: 12900,
  total: 12900,
  updatedAt: '2027-03-01T00:00:00.000Z',
};

/** A row of the list of invoices, for a customer. */
export const invoiceRow = (
  id: string,
  customerName: string,
  overrides: Partial<InvoiceSummary> = {},
): InvoiceSummary => ({
  ...FIRST_INVOICE,
  customerName,
  customerSlug: customerName.toLowerCase(),
  id,
  instanceName: `${customerName} Production`,
  instanceSlug: `${customerName.toLowerCase()}-production`,
  ...overrides,
});

/** A row of the handoff queue: an invoice the accounting system has not booked. */
export const queuedRow = (
  id: string,
  customerName: string,
  overrides: Partial<QueuedInvoice> = {},
): QueuedInvoice =>
  ({
    ...invoiceRow(id, customerName),
    handoff: { claimCount: 0, status: 'PENDING' },
    handoffStatus: 'PENDING',
    issuedAt: '2027-03-02T00:00:00.000Z',
    status: 'MANUAL',
    ...overrides,
  }) as QueuedInvoice;

/** A page of a list the API pages by cursor, with a next page when a cursor is given. */
export const pageOf = <T,>(items: T[], next?: string) => ({
  hasMore: next !== undefined,
  items,
  nextCursor: next,
});
