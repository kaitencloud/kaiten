import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Addon, InstanceAddon, LicenseFamilyView, NewInstanceAddon } from '@/api-client';
import {
  handleAttachInstanceAddon,
  handleGetBillingCapabilities,
  handleGetEntitlementsUsageMetrics,
  handleGetInstanceBilling,
  handleListAddonCompatibility,
  handleListAddonPrices,
  handleListAddons,
  handleListInstanceAddons,
  handleListLicenseFamilies,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildAddon } from '../../../../../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { INSTANCE, subscription } from '../../__tests__/lifecycle-fixtures';
import { AttachAddonDialog } from '../attach-addon-dialog';
import {
  heldSeats,
  SEATS_V1,
  STORAGE_MONTHLY,
  STORAGE_V1,
  usageOf,
} from './addons-fixtures';

const getAuthToken = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../../../instance-detail-context', () => ({
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

const BUSINESS_FAMILY: LicenseFamilyView = {
  createdAt: '2026-01-01T00:00:00.000Z',
  id: 'family-business',
  isPublic: false,
  slug: 'business',
  updatedAt: '2026-01-01T00:00:00.000Z',
  versionCount: 2,
};
const SUPPORT_V1: Addon = buildAddon({
  familySlug: 'priority-support',
  maxQuantity: 1,
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
// What each version fits, by the license families: the seats and the support fit
// Business, the storage fits another family.
const FITS: Record<string, string[]> = {
  'extra-seats-v1': ['business'],
  'extra-seats-v2': ['business'],
  'extra-storage-v1': ['business', 'enterprise'],
  'priority-support-v1': ['business'],
};

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:instances', 'write:instances', 'read:addons', 'read:licenses']),
  );
  detail.current = {
    entitlements: [{ name: 'Storage', slug: 'storage-gb' }],
    instance: INSTANCE,
    license: { familyId: 'family-business', lifecycleState: 'PUBLISHED', name: 'Business' },
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleGetInstanceBilling({ body: subscription() }),
    handleListInstanceAddons({ body: [heldSeats()] }),
    handleListAddons({ body: [SEATS_V1, DRAFT_V2, STORAGE_V1, SUPPORT_V1] }),
    handleListLicenseFamilies({ body: pageOf([BUSINESS_FAMILY]) }),
    handleListAddonCompatibility(({ params }) =>
      HttpResponse.json({ familySlugs: FITS[String(params.addonSlug)] ?? [] }),
    ),
    handleListAddonPrices(({ params }) =>
      HttpResponse.json(params.addonSlug === 'extra-storage-v1' ? [STORAGE_MONTHLY] : []),
    ),
    handleGetEntitlementsUsageMetrics({ body: [usageOf('storage-gb', 50)] }),
  );
});

/** Records what the API is asked to attach. */
function serveAttach(answer?: (body: NewInstanceAddon) => Response) {
  const bodies: NewInstanceAddon[] = [];
  server.use(
    handleAttachInstanceAddon(async ({ request }) => {
      const body = (await request.json()) as NewInstanceAddon;
      bodies.push(body);

      return (
        answer?.(body) ??
        HttpResponse.json(
          { ...heldSeats({ id: 'attachment-new' }), addonSlug: body.addonSlug } as InstanceAddon,
          { status: 201 },
        )
      );
    }),
  );

  return bodies;
}

const renderDialog = (onClose = vi.fn()) => {
  renderWithClient(<AttachAddonDialog onClose={onClose} />);

  return { onClose };
};

const choose = async (name: string) => {
  await userEvent.click(await screen.findByRole('combobox', { name: /Add-on/ }));
  await userEvent.click(await screen.findByRole('option', { name }));
};
const submit = () => screen.findByRole('button', { name: 'Add the add-on' });

describe('the dialog that adds an add-on to an instance', () => {
  it('names the instance and says the entitlements apply at once, with when they are billed', async () => {
    renderDialog();

    expect(
      await screen.findByRole('dialog', { name: 'Add an add-on to Globex Production' }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('addons-note')).toHaveTextContent(
      'Entitlement changes now; billed from the next renewal; no proration or refund.',
    );
  });

  it('offers the versions on sale that fit the license family of the instance, of a family it holds none of', async () => {
    renderDialog();

    await userEvent.click(await screen.findByRole('combobox', { name: /Add-on/ }));
    const options = await screen.findAllByRole('option');

    // The seats are held, the second version of them is a draft, and the storage and
    // the support are on sale and fit Business.
    expect(options.map((option) => option.textContent)).toEqual([
      'Extra storage · 2026',
      'Priority support · 2026',
    ]);
  });

  it('does not offer a version that fits another family of licenses', async () => {
    detail.current = {
      ...detail.current,
      license: { familyId: 'family-starter', lifecycleState: 'PUBLISHED', name: 'Starter' },
    };
    server.use(
      handleListLicenseFamilies({
        body: pageOf([{ ...BUSINESS_FAMILY, id: 'family-starter', slug: 'starter' }]),
      }),
    );
    renderDialog();

    expect(await screen.findByTestId('attach-addon-unavailable')).toHaveTextContent(
      'No add-on can be added',
    );
    expect(screen.queryByRole('button', { name: 'Add the add-on' })).toBeNull();
  });

  it('describes the version chosen, and what the subscription bills for a unit of it', async () => {
    renderDialog();

    await choose('Extra storage · 2026');

    const details = await screen.findByTestId('attach-addon-details');
    expect(details).toHaveTextContent('More disk space for the files of an instance');
    await waitFor(() =>
      expect(details).toHaveTextContent('$8.00/month per unit, billed from the next renewal.'),
    );
    expect(screen.getByText('From 1 to 20.')).toBeInTheDocument();
  });

  it('says a version without a price for the period of the subscription is one the API will refuse', async () => {
    server.use(handleListAddonPrices({ body: [{ ...STORAGE_MONTHLY, billingPeriod: 'ANNUAL' }] }));
    renderDialog();

    await choose('Extra storage · 2026');

    expect(await screen.findByTestId('attach-addon-details')).toHaveTextContent(
      'no default price for the billing period of the subscription (Monthly)',
    );
  });

  it('says a version sold on request has no price to bill', async () => {
    renderDialog();

    await choose('Priority support · 2026');

    expect(await screen.findByTestId('attach-addon-details')).toHaveTextContent(
      'Sold on request: no price is set',
    );
  });

  it('sends the version and the quantity once, closes, and says what it did to the entitlements', async () => {
    const bodies = serveAttach();
    const { onClose } = renderDialog();
    await choose('Extra storage · 2026');
    const quantity = await screen.findByLabelText(/Quantity/);

    await userEvent.clear(quantity);
    await userEvent.type(quantity, '3');
    await userEvent.dblClick(await submit());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toEqual([{ addonSlug: 'extra-storage-v1', quantity: 3 }]);
    expect(toast.success).toHaveBeenCalledWith('Extra storage · 2026 added (× 3)', undefined);
  });

  it('refuses a quantity above the most the version allows, before the API does', async () => {
    const bodies = serveAttach();
    renderDialog();
    await choose('Extra storage · 2026');
    const quantity = await screen.findByLabelText(/Quantity/);

    await userEvent.clear(quantity);
    await userEvent.type(quantity, '21');
    await userEvent.tab();

    expect(await screen.findByText('This add-on allows fewer units')).toBeInTheDocument();
    await userEvent.click(await submit());
    expect(bodies).toEqual([]);
  });

  it('asks for a version before it asks the API', async () => {
    const bodies = serveAttach();
    renderDialog();

    await userEvent.click(await submit());

    // The placeholder says it too: the message is the one under the field.
    expect(
      await screen.findByText('Choose an add-on', { selector: '[data-slot="form-message"]' }),
    ).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('shows a refusal on the field it is about, with the words of the API, and keeps what was typed', async () => {
    serveAttach(() =>
      refusal(422, {
        code: 'AttachInstanceAddon.NoPriceForBillingPeriod',
        detail: "the add-on has no default ACTIVE price for the subscription's MONTHLY period",
      }),
    );
    const { onClose } = renderDialog();
    await choose('Extra storage · 2026');

    await userEvent.click(await submit());

    expect(
      await screen.findByText("the add-on has no default ACTIVE price for the subscription's MONTHLY period"),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /Add-on/ })).toHaveTextContent('Extra storage · 2026');
  });

  it('shows a refusal that is about no field above the buttons, with a way to ask again', async () => {
    let calls = 0;
    const bodies = serveAttach(() => {
      calls += 1;

      return calls === 1
        ? refusal(503, { detail: 'the add-ons are unavailable' })
        : HttpResponse.json(heldSeats({ id: 'attachment-new' }), { status: 201 });
    });
    const { onClose } = renderDialog();
    await choose('Extra storage · 2026');

    await userEvent.click(await submit());
    expect(await screen.findByRole('alert')).toHaveTextContent('the add-ons are unavailable');
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(bodies).toHaveLength(2);
  });

  it('waits out a period that is being closed and sends the same request again', async () => {
    let calls = 0;
    const bodies = serveAttach(() => {
      calls += 1;

      return calls === 1
        ? HttpResponse.json(
            {
              code: 'AttachInstanceAddon.BoundaryPending',
              detail: 'the period has ended and is being closed; retry in a minute',
              status: 409,
            },
            { headers: { 'Retry-After': '1' }, status: 409 },
          )
        : HttpResponse.json(heldSeats({ id: 'attachment-new' }), { status: 201 });
    });
    const { onClose } = renderDialog();
    await choose('Extra storage · 2026');

    await userEvent.click(await submit());

    expect(await screen.findByTestId('boundary-closing')).toHaveTextContent('Closing the period');
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 4000 });
    expect(bodies).toEqual([
      { addonSlug: 'extra-storage-v1', quantity: 1 },
      { addonSlug: 'extra-storage-v1', quantity: 1 },
    ]);
  });
});

describe('when there is nothing to add', () => {
  it.each(['CANCELED'] as const)('says an instance whose subscription is %s takes none', async (status) => {
    server.use(handleGetInstanceBilling({ body: subscription({ status }) }));
    renderDialog();

    expect(await screen.findByTestId('attach-addon-unavailable')).toHaveTextContent(
      'Add-ons can only be added while the subscription is live',
    );
  });

  it('says an instance nobody bills takes none', async () => {
    server.use(
      handleGetInstanceBilling(() =>
        refusal(404, { code: 'GetInstanceBilling.NotFound', detail: 'No subscription' }),
      ),
    );
    renderDialog();

    expect(await screen.findByTestId('attach-addon-unavailable')).toHaveTextContent(
      'Add-ons can only be added while the subscription is live',
    );
  });

  it.each(['TRIAL', 'PAST_DUE'] as const)('offers them to a subscription that is %s', async (status) => {
    server.use(handleGetInstanceBilling({ body: subscription({ status }) }));
    renderDialog();

    expect(await screen.findByRole('combobox', { name: /Add-on/ })).toBeInTheDocument();
  });

  it('says what could not be read, with a way to ask again', async () => {
    let calls = 0;
    server.use(
      handleListAddons(() => {
        calls += 1;

        return calls === 1
          ? refusal(503, { detail: 'the catalogue is unavailable' })
          : HttpResponse.json([STORAGE_V1]);
      }),
    );
    renderDialog();

    expect(await screen.findByText('the catalogue is unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('combobox', { name: /Add-on/ })).toBeInTheDocument();
  });

  it('still offers the others when one version could not be checked, and says so', async () => {
    let storageReads = 0;
    server.use(
      handleListAddonCompatibility(({ params }) => {
        if (params.addonSlug === 'extra-storage-v1') {
          storageReads += 1;

          return storageReads === 1
            ? refusal(503, { detail: 'the compatibility is unavailable' })
            : HttpResponse.json({ familySlugs: ['business'] });
        }

        return HttpResponse.json({ familySlugs: FITS[String(params.addonSlug)] ?? [] });
      }),
    );
    renderDialog();

    const notice = await screen.findByTestId('addons-read-notice');
    expect(notice).toHaveTextContent('Some add-ons could not be checked');
    expect(notice).toHaveTextContent('the compatibility is unavailable');
    await userEvent.click(await screen.findByRole('combobox', { name: /Add-on/ }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Priority support · 2026',
    ]);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(within(notice).getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.queryByTestId('addons-read-notice')).toBeNull());
    await userEvent.click(await screen.findByRole('combobox', { name: /Add-on/ }));
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Extra storage · 2026',
      'Priority support · 2026',
    ]);
  });
});
