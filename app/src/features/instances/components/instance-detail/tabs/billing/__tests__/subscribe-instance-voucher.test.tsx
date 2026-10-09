import { screen, waitFor } from '@testing-library/react';
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
import { SEATS_V1, STORAGE_V1 } from '../addons/__tests__/addons-fixtures';

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
      'write:voucher_redemptions',
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
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithVouchers() }),
    handleListLicensePrices({ body: [MONTHLY] }),
    handleGetBillingSettings({
      body: { defaultCollectionMethod: 'SEND_INVOICE', defaultDaysUntilDue: 30, handoffStripeInvoices: false },
    }),
    handleListInstanceAddons({ body: [] }),
    handleListAddons({ body: [SEATS_V1, DRAFT_V2, STORAGE_V1, SUPPORT_V1] }),
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
const codeField = () => screen.findByLabelText(/^Voucher code/);

describe('the voucher code a subscription can start with', () => {
  it('is asked for, optionally, where the release has vouchers and the session may redeem them', async () => {
    renderDialog();

    const field = await codeField();

    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).not.toBeRequired();
    expect(
      screen.getByText(/Optional\. The code is redeemed with the subscription/),
    ).toBeInTheDocument();
  });

  it('is not asked for where the release ships no vouchers', async () => {
    server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }));
    renderDialog();

    await subscribe();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByLabelText(/^Voucher code/)).toBeNull();
  });

  it('is not asked for by a session that may not redeem a voucher', async () => {
    getAuthToken.mockResolvedValue(
      sessionToken(['read:billing', 'write:billing', 'read:instances', 'read:addons', 'read:licenses']),
    );
    renderDialog();

    await subscribe();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByLabelText(/^Voucher code/)).toBeNull();
  });

  it('is sent with the subscription as typed, without the spaces around it', async () => {
    const bodies = serveSubscribe();
    renderDialog();

    await userEvent.type(await codeField(), '  launch-20-off ');
    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ basePriceId: 'price-monthly', voucherCode: 'launch-20-off' });
  });

  it('is left out of the request when nothing was typed', async () => {
    const bodies = serveSubscribe();
    renderDialog();
    await codeField();

    await userEvent.click(await subscribe());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('voucherCode');
  });

  it('shows the refusal on its field, with the words of the API, and keeps the subscription from starting', async () => {
    serveSubscribe(() =>
      HttpResponse.json(
        {
          code: 'SubscribeInstance.VoucherInvalid',
          detail: 'the voucher cannot be redeemed',
          errors: [
            {
              location: 'body.voucherCode',
              message: 'this voucher has expired',
              value: { code: 'launch-20-off' },
            },
          ],
          status: 422,
        },
        { status: 422 },
      ),
    );
    const { onClose } = renderDialog();
    await userEvent.type(await codeField(), 'launch-20-off');

    await userEvent.click(await subscribe());

    expect(await screen.findByText('this voucher has expired')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // What was typed stays, to be corrected.
    expect(await codeField()).toHaveValue('launch-20-off');
    expect(screen.queryByText('the voucher cannot be redeemed')).toBeNull();
  });

  it('shows a refusal that is about no field above the buttons', async () => {
    serveSubscribe(() => refusal(503, { code: 'Billing.Down', detail: 'Billing is being moved.' }));
    renderDialog();
    await userEvent.type(await codeField(), 'launch-20-off');

    await userEvent.click(await subscribe());

    expect(await screen.findByText('Billing is being moved.')).toBeInTheDocument();
  });
});
