import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  Addon,
  LicenseFamilyView,
  NewSubscription,
  StartedSubscription,
} from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetBillingSettings,
  handleListAddonCompatibility,
  handleListAddons,
  handleListInstanceAddons,
  handleListLicenseFamilies,
  handleListLicensePrices,
  handleSubscribeInstance,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildAddon } from '../../../../../../../../e2e/app/_support/fixtures';
import { buildPrice } from '../../../../../../../../e2e/app/_support/fixtures/build-pricing';
import { buildSubscription } from '../../../../../../../../e2e/app/_support/fixtures/build-subscription';
import { billingCapabilitiesProfiles } from '../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { SubscribeInstanceDialog } from '../subscribe/subscribe-instance-dialog';
import { heldSeats, SEATS_V1, STORAGE_V1 } from '../addons/__tests__/addons-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../instance-detail-context', () => ({
  useInstanceDetail: () => detail.current,
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

const MONTHLY = buildPrice({
  billingPeriod: 'MONTHLY',
  displayLabel: 'Business, monthly',
  id: 'price-monthly',
  isDefault: true,
  unitAmountDecimal: '9900',
});
const BUSINESS_FAMILY: LicenseFamilyView = {
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 'family-business',
  isPublic: false,
  slug: 'business',
  updatedAt: '2026-01-01T00:00:00.000Z',
  versionCount: 1,
};
const SUPPORT_V1: Addon = buildAddon({
  familySlug: 'priority-support',
  name: 'Priority support',
  pricingType: 'CUSTOM',
  slug: 'priority-support-v1',
  versionName: '2026',
});
const DRAFT_V2: Addon = buildAddon({
  familySlug: 'extra-seats',
  lifecycleState: 'DRAFT',
  name: 'Extra seats',
  slug: 'extra-seats-v2',
  version: 2,
  versionName: '2027',
});
// The seats and the storage fit Business; the support fits another family.
const FITS: Record<string, string[]> = {
  'extra-seats-v1': ['business'],
  'extra-storage-v1': ['business'],
  'priority-support-v1': ['enterprise'],
};

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken([
      'read:billing',
      'write:billing',
      'read:instances',
      'read:addons',
      'read:licenses',
    ]),
  );
  detail.current = {
    customer: { billingEmail: 'ap@globex.com', id: 'customer-1', name: 'Globex', slug: 'globex' },
    instance: {
      id: 'ins-1',
      licenseSlug: 'business',
      name: 'Globex Production',
      slug: 'globex-production',
    },
    license: { familyId: 'family-business', lifecycleState: 'PUBLISHED', name: 'Business', slug: 'business', version: '2' },
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleListLicensePrices({ body: [MONTHLY] }),
    handleGetBillingSettings({
      body: { defaultCollectionMethod: 'SEND_INVOICE', defaultDaysUntilDue: 30, handoffStripeInvoices: false },
    }),
    handleListInstanceAddons({ body: [] }),
    handleListAddons({ body: pageOf([SEATS_V1, DRAFT_V2, STORAGE_V1, SUPPORT_V1]) }),
    handleListLicenseFamilies({ body: pageOf([BUSINESS_FAMILY]) }),
    handleListAddonCompatibility(({ params }) =>
      HttpResponse.json({ familySlugs: FITS[String(params.addonSlug)] ?? [] }),
    ),
  );
});

/** Records the bodies of the subscriptions the API is asked to start. */
function serveSubscribe(answer?: (body: NewSubscription) => Response) {
  const bodies: NewSubscription[] = [];
  server.use(
    handleSubscribeInstance(async ({ request }) => {
      const body = (await request.json()) as NewSubscription;
      bodies.push(body);

      return (
        answer?.(body) ??
        HttpResponse.json(
          {
            ...buildSubscription({
              anchorAt: '2027-03-15T10:00:00.000Z',
              basePrice: MONTHLY,
              instanceSlug: 'globex-production',
            }),
            activationInvoice: undefined,
          } as StartedSubscription,
          { status: 201 },
        )
      );
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(<SubscribeInstanceDialog onClose={onClose} />);

  return { onClose };
};

const subscribe = () => screen.findByRole('button', { name: 'Subscribe' });
const fieldset = () => screen.findByTestId('subscribe-addons');

describe('the add-ons a subscription can start with', () => {
  it('are offered when they fit the license family of the instance and are on sale, each to include or not', async () => {
    renderDialog();

    const add = await fieldset();

    // The draft is not on sale and the support fits another family of licenses.
    expect(within(add).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(add).getByText('Extra seats · 2026')).toBeInTheDocument();
    expect(within(add).getByText('Extra storage · 2026')).toBeInTheDocument();
    expect(within(add).queryByText(/Priority support/)).toBeNull();
    expect(within(add).queryByText(/Extra seats · 2027/)).toBeNull();
    expect(within(add).getByText('Up to 3 units')).toBeInTheDocument();
    // Optional: none is included until the person says so.
    for (const box of within(add).getAllByRole('checkbox')) {
      expect(box).not.toBeChecked();
    }
    expect(within(add).queryByRole('group')).toBeNull();
  });

  it('are not offered a family the instance holds a version of already', async () => {
    server.use(handleListInstanceAddons({ body: [heldSeats()] }));
    renderDialog();

    const add = await fieldset();

    expect(within(add).queryByText(/Extra seats/)).toBeNull();
    expect(within(add).getByText('Extra storage · 2026')).toBeInTheDocument();
  });

  it('are not asked about where the release has none', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }));
    renderDialog();

    await screen.findByRole('button', { name: 'Subscribe' });

    expect(screen.queryByTestId('subscribe-addons')).toBeNull();
  });

  it.each([
    ['read:addons', ['read:billing', 'write:billing', 'read:instances', 'read:licenses']],
    ['read:licenses', ['read:billing', 'write:billing', 'read:instances', 'read:addons']],
  ])('are not asked about by a session without %s', async (_scope, scopes) => {
    getAuthToken.mockResolvedValue(sessionToken(scopes));
    renderDialog();

    await screen.findByRole('button', { name: 'Subscribe' });

    expect(screen.queryByTestId('subscribe-addons')).toBeNull();
  });

  it('are not asked about when none fits', async () => {
    server.use(handleListAddonCompatibility({ body: { familySlugs: [] } }));
    renderDialog();

    await screen.findByRole('button', { name: 'Subscribe' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByTestId('subscribe-addons')).toBeNull();
  });

  it('never keep the subscription from starting when they cannot be read', async () => {
    server.use(handleListAddons(() => refusal(503, { detail: 'the catalogue is unavailable' })));
    const bodies = serveSubscribe();
    renderDialog();

    expect(await screen.findByTestId('addons-read-notice')).toHaveTextContent(
      'the catalogue is unavailable',
    );
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('addOns');
  });

  it('offer the others, and say so, when one of them could not be checked', async () => {
    server.use(
      handleListAddonCompatibility(({ params }) =>
        params.addonSlug === 'extra-storage-v1'
          ? refusal(503, { detail: 'the compatibility is unavailable' })
          : HttpResponse.json({ familySlugs: FITS[String(params.addonSlug)] ?? [] }),
      ),
    );
    renderDialog();
    const add = await fieldset();

    expect(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' })).toBeInTheDocument();
    expect(within(add).queryByRole('checkbox', { name: 'Extra storage · 2026' })).toBeNull();
    expect(await screen.findByTestId('addons-read-notice')).toHaveTextContent(
      'Some add-ons could not be checked',
    );
  });

  it('are sent with the subscription, each with its units, in the order they were included', async () => {
    const bodies = serveSubscribe();
    renderDialog();
    const add = await fieldset();

    await userEvent.click(within(add).getByRole('checkbox', { name: 'Extra storage · 2026' }));
    await userEvent.click(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'One unit more of Extra seats · 2026' }),
    );
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      addOns: [
        { addonSlug: 'extra-storage-v1', quantity: 1 },
        { addonSlug: 'extra-seats-v1', quantity: 2 },
      ],
      basePriceId: 'price-monthly',
      providerKind: 'NOOP',
      trialDays: 0,
    });
  });

  it('are taken out of the subscription when they are unchecked, with what was typed for them', async () => {
    const bodies = serveSubscribe();
    renderDialog();
    const add = await fieldset();

    await userEvent.click(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' }));
    await userEvent.click(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' }));
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('addOns');
  });

  it('stop at the most each version allows', async () => {
    renderDialog();
    const add = await fieldset();

    await userEvent.click(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' }));
    const more = await screen.findByRole('button', { name: 'One unit more of Extra seats · 2026' });
    await userEvent.click(more);
    await userEvent.click(more);

    expect(more).toBeDisabled();
    expect(
      within(screen.getByRole('group', { name: 'Quantity of Extra seats · 2026' })).getByTestId('quantity-value'),
    ).toHaveTextContent('3');
  });

  it('show the refusal of one of them on their field, with the words of the API, and keep the subscription from starting', async () => {
    const bodies = serveSubscribe(() =>
      HttpResponse.json(
        {
          code: 'SubscribeInstance.AddonInvalid',
          detail: 'an add-on cannot be attached',
          errors: [
            {
              location: 'body.addOns[0]',
              message: 'this add-on allows at most 3 units',
              value: { code: 'AttachInstanceAddon.QuantityExceedsMax' },
            },
          ],
          status: 422,
        },
        { status: 422 },
      ),
    );
    const { onClose } = renderDialog();
    const add = await fieldset();
    await userEvent.click(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' }));

    await userEvent.click(await subscribe());

    expect(
      await within(add).findByRole('alert'),
    ).toHaveTextContent('this add-on allows at most 3 units');
    expect(bodies).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    // What was typed stays, and a change of it takes the refusal away.
    expect(within(add).getByRole('checkbox', { name: 'Extra seats · 2026' })).toBeChecked();
    await userEvent.click(
      await screen.findByRole('button', { name: 'One unit more of Extra seats · 2026' }),
    );
    await waitFor(() => expect(within(add).queryByRole('alert')).toBeNull());
  });
});
