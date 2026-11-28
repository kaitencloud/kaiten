import { screen, within } from '@testing-library/react';
import { HttpResponse } from 'msw/http';
import type { AnchorHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Entitlement } from '@/api-client';
import { handleListEntitlements } from '@/api-client/msw.gen';
import {
  pageOf,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { EntitlementDetailSourcesCard } from '../entitlement-detail-sources-card';

// The router is plain anchors: the rows of the table lead to the page of the source they name.
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: Record<string, string>;
    to: string;
  }) => (
    <a {...props} href={to.replace('$entitlementSlug', params?.entitlementSlug ?? '')}>
      {children}
    </a>
  ),
  useRouter: () => ({
    buildLocation: ({
      params,
      to,
    }: {
      params: { entitlementSlug: string };
      to: string;
    }) => ({ pathname: to.replace('$entitlementSlug', params.entitlementSlug) }),
  }),
}));

useBillingTexts();

const definition = (overrides: Partial<Entitlement> & { slug: string }) =>
  ({
    createdAt: '2026-03-01T09:00:00.000Z',
    id: `entitlement-${overrides.slug}`,
    name: overrides.slug,
    type: 'NUMBER',
    updatedAt: '2026-03-01T09:00:00.000Z',
    ...overrides,
  }) as Entitlement;

const credits = definition({
  name: 'Credits',
  slug: 'credits',
  sources: [
    { entitlementSlug: 'ai-credits', weight: '0.6' },
    { entitlementSlug: 'firecrawl-credits', weight: '0.4' },
  ],
  usageSource: 'COMBINED_USAGE',
});

describe('the sources of a combined entitlement', () => {
  it('are listed with the weight each is summed at, the unit it counts in and a link to its page', async () => {
    server.use(
      handleListEntitlements(() =>
        HttpResponse.json(
          pageOf([
            definition({
              name: 'AI Credits',
              slug: 'ai-credits',
              unitPlural: 'credits',
            }),
            definition({ name: 'Firecrawl Credits', slug: 'firecrawl-credits' }),
          ]),
        ),
      ),
    );
    renderWithClient(<EntitlementDetailSourcesCard entitlement={credits} />);

    expect(await screen.findByText('Sources')).toBeInTheDocument();
    // Nothing is stored for the sum, and nothing is enforced on it: said before anyone looks for a limit.
    expect(screen.getByText(/Nothing is stored for the sum/)).toBeInTheDocument();
    const ai = await screen.findByRole('row', { name: /AI Credits/ });
    expect(within(ai).getByText('0.6')).toBeInTheDocument();
    expect(within(ai).getByText('credits')).toBeInTheDocument();
    expect(within(ai).getByRole('link', { name: 'AI Credits' })).toHaveAttribute(
      'href',
      '/catalog/entitlements/ai-credits',
    );
    const firecrawl = screen.getByRole('row', { name: /Firecrawl Credits/ });
    expect(within(firecrawl).getByText('0.4')).toBeInTheDocument();
  });

  it('name a source the catalogue does not hold by its slug, and keep its weight', async () => {
    server.use(handleListEntitlements(() => HttpResponse.json(pageOf([]))));
    renderWithClient(<EntitlementDetailSourcesCard entitlement={credits} />);

    const row = await screen.findByRole('row', { name: /firecrawl-credits/ });
    expect(within(row).getByText('0.4')).toBeInTheDocument();
  });

  it('say there are none for an entitlement that sums nothing', async () => {
    server.use(handleListEntitlements(() => HttpResponse.json(pageOf([]))));
    renderWithClient(
      <EntitlementDetailSourcesCard entitlement={{ ...credits, sources: [] }} />,
    );

    expect(
      await screen.findByText('This entitlement has no sources.'),
    ).toBeInTheDocument();
  });
});
