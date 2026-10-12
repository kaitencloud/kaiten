import { screen, waitFor } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { ActionAccordion } from '@/components/ui/action-accordion';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildLicense } from '../../../../../e2e/app/_support/fixtures/build-license';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import type { LicenseGroup, LicenseWithInstances } from '../../types';
import { LicenseListItem } from '../license-list-item';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { params?: unknown; to: string }) => (
    <a {...props} data-params={JSON.stringify(params)} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

const head = {
  ...buildLicense({
    description: 'Pro',
    familyId: 'family-pro',
    id: 'license-pro-2',
    lifecycleState: 'PUBLISHED',
    name: 'Pro',
    slug: 'pro-v2',
    type: 'PAID',
    version: '2',
  }),
  nbInstances: 0,
} as LicenseWithInstances;

const group = (overrides: Partial<LicenseGroup> = {}): LicenseGroup => ({
  defaultLicense: undefined,
  familyId: 'family-pro',
  familySlug: 'pro',
  headLicense: head,
  isPublic: false,
  licenseName: 'Pro',
  licenses: [head],
  ...overrides,
});

const renderItem = (value: LicenseGroup) =>
  renderWithClient(
    <ActionAccordion>
      <LicenseListItem group={value} />
    </ActionAccordion>,
  );

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:licenses', 'write:licenses']));
  server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }));
});

describe('a family in the list of licenses', () => {
  it('says it is public, and offers the switch to take it out, where billing is on', async () => {
    renderItem(group({ isPublic: true }));

    expect(await screen.findByText('Public')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'List Pro in the public catalogue' })).toBeChecked();
  });

  it('says nothing of the catalogue for a family that is private, and offers the switch to list it', async () => {
    renderItem(group());

    expect(await screen.findByRole('switch', { name: 'List Pro in the public catalogue' })).not.toBeChecked();
    expect(screen.queryByText('Public')).toBeNull();
  });

  it('says nothing of the catalogue where billing is off, whatever the family says', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.disabled() }));
    renderItem(group({ isPublic: true }));

    await screen.findByRole('link', { name: /New Version/ });
    await waitFor(() => expect(screen.queryByText('Public')).toBeNull());
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('keeps the way to a new version beside the switch', async () => {
    renderItem(group());

    expect(await screen.findByRole('link', { name: /New Version/ })).toHaveAttribute(
      'href',
      '/catalog/licenses/versions/$licenseSlug',
    );
  });
});

// How the version a family is shown under is sold, read apart from the licenses: the flat
// fee of each period, or that it is free or on request, in the words of the console. The
// document is asked for only where billing is on.
describe('how a family is sold, in the list of licenses', () => {
  const price = (id: string, billingPeriod: string, unitAmountDecimal: string) => ({
    billingModel: 'FLAT_FEE',
    billingPeriod,
    billingTiming: 'ADVANCE',
    currency: 'USD',
    displayLabel: null,
    displayOrder: 0,
    id,
    isDefault: true,
    meteredEntitlement: null,
    saleUnitFactor: null,
    status: 'ACTIVE',
    unitAmountDecimal,
  });
  const sold = (pricingType: string, prices: object[], id = head.id) => ({
    licenses: {
      hasMore: false,
      items: [
        {
          id,
          lifecycleState: 'PUBLISHED',
          name: 'Pro',
          pricingType,
          prices,
          slug: 'pro-v2',
          version: '2',
          versionName: null,
        },
      ],
      nextCursor: null,
    },
  });
  const answer = (data: unknown) => {
    const requests: unknown[] = [];
    server.use(
      graphqlOperationHandler({
        GetLicensesWithPrices: (variables) => {
          requests.push(variables);
          return data;
        },
      }),
    );

    return requests;
  };

  it('lists the flat fee of each billing period of the version the family is shown under', async () => {
    answer(
      sold('PAID', [
        price('price-annual', 'ANNUAL', '39000'),
        price('price-monthly', 'MONTHLY', '3900'),
      ]),
    );
    renderItem(group());

    expect(await screen.findByTestId('license-price-summary')).toHaveTextContent(
      '$39.00/month·$390.00/year',
    );
  });

  it('says a free version is free and a custom one is custom, with no amount', async () => {
    answer(sold('FREE', []));
    const free = renderItem(group());
    expect(await screen.findByTestId('license-price-summary')).toHaveTextContent('Free');
    free.unmount();

    answer(sold('CUSTOM', [price('price-annual', 'ANNUAL', '39000')]));
    renderItem(group());
    expect(await screen.findByTestId('license-price-summary')).toHaveTextContent(
      'Custom pricing',
    );
    expect(screen.queryByText(/\$390/)).toBeNull();
  });

  it('says a version that is sold with no active price has none yet', async () => {
    answer(sold('PAID', []));
    renderItem(group());

    expect(await screen.findByTestId('license-price-summary')).toHaveTextContent(
      'No price yet',
    );
  });

  it('says nothing for a version the document does not list, and asks once for all the families', async () => {
    const requests = answer(sold('PAID', [price('p', 'MONTHLY', '3900')], 'another-version'));
    renderItem(group());

    await waitFor(() => expect(requests).toHaveLength(1));
    await screen.findByRole('link', { name: /New Version/ });
    expect(screen.queryByTestId('license-price-summary')).toBeNull();
  });

  it('asks for nothing and says nothing where billing is off', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.disabled() }));
    const requests = answer(sold('PAID', [price('p', 'MONTHLY', '3900')]));
    renderItem(group());

    await screen.findByRole('link', { name: /New Version/ });
    expect(screen.queryByTestId('license-price-summary')).toBeNull();
    expect(requests).toHaveLength(0);
  });
});
