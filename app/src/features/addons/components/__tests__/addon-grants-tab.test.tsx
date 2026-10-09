import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { AddonEntitlement, NewAddonGrant } from '@/api-client';
import {
  handleAssignAddonEntitlement,
  handleGetAddon,
  handleGetBillingCapabilities,
  handleGetLicenseEntitlements,
  handleListAddonCompatibility,
  handleListAddonEntitlements,
  handleListEntitlements,
  handleListLicenseFamilies,
  handleUnassignAddonEntitlement,
  handleUpdateAddonEntitlement,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildGrant } from '../../../../../e2e/app/_support/fixtures/build-pricing';
import { buildLicense } from '../../../../../e2e/app/_support/fixtures/build-license';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { AddonGrantsTab } from '../grants';
import {
  API_CALLS,
  ENTITLEMENTS,
  licenseFamily,
  renderScreen,
  SEATS_DRAFT,
  seatsGrant,
} from './addon-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./addon-test-support')).createAddonRouterModule(navigate),
);

useBillingTexts();

const SCOPES = ['read:billing', 'read:addons', 'write:addons', 'read:licenses'];

beforeEach(() => {
  navigate.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(SCOPES));
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleGetAddon({ body: SEATS_DRAFT }),
    handleListAddonEntitlements({ body: [seatsGrant()] }),
    handleListEntitlements({ body: pageOf(ENTITLEMENTS) }),
    handleListAddonCompatibility({ body: { familySlugs: [] } }),
    handleListLicenseFamilies({ body: pageOf([]) }),
  );
});

const renderTab = (grantParam?: string) =>
  renderScreen(<AddonGrantsTab addonSlug={SEATS_DRAFT.slug} grantParam={grantParam} />);

/** Records what the API is asked to give the version. */
function serveAssign(answer?: (body: NewAddonGrant) => Response) {
  const bodies: NewAddonGrant[] = [];
  server.use(
    handleAssignAddonEntitlement(async ({ request }) => {
      const body = (await request.json()) as NewAddonGrant;
      bodies.push(body);

      return (
        answer?.(body) ??
        HttpResponse.json(
          { ...seatsGrant(), entitlementSlug: body.entitlementSlug } as AddonEntitlement,
          { status: 201 },
        )
      );
    }),
  );

  return bodies;
}

const choose = async (name: string) => {
  await userEvent.click(await screen.findByRole('combobox', { name: /Entitlement/ }));
  await userEvent.click(await screen.findByRole('option', { name }));
};

describe('the grants of a version', () => {
  it('say what one unit gives, how it combines with the license, and the overage it allows', async () => {
    renderTab();

    const row = (await screen.findByText('Seats')).closest('tr');

    expect(within(row!).getByText('5 per unit')).toBeInTheDocument();
    expect(within(row!).getByText('Add')).toBeInTheDocument();
    // No percentage of its own: it inherits the license's.
    expect(within(row!).getByText('Inherit')).toBeInTheDocument();
  });

  it('say a flag is enabled and an overage that is a hard limit, and a soft one by its percentage', async () => {
    server.use(
      handleListAddonEntitlements({
        body: [
          { ...seatsGrant(), limitCapExceededOveragePercent: 0 },
          {
            entitlementSlug: 'advanced-analytics',
            entitlementType: 'BOOLEAN',
            id: 'grant-analytics',
            overrideBehavior: 'MAX',
            value: { type: 'boolean', value: true },
          },
          {
            ...seatsGrant(),
            entitlementSlug: 'api-calls',
            id: 'grant-calls',
            limitCapExceededOveragePercent: 20,
            value: { type: 'number', value: 1000 },
          },
        ],
      }),
    );
    renderTab();

    expect(await screen.findByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Hard limit')).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
  });

  it('offer to add one, while an entitlement is left to grant and the session may write', async () => {
    renderTab();

    expect(await screen.findByRole('link', { name: 'Add entitlement' })).toHaveAttribute(
      'href',
      '/addons/extra-seats-v2/entitlements?grant=new',
    );
  });

  it('are only read by a session that may not write them', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons']));
    renderTab();

    await screen.findByText('Seats');

    expect(screen.queryByRole('link', { name: 'Add entitlement' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('are not added to once every entitlement is granted', async () => {
    server.use(
      handleListEntitlements({ body: pageOf([ENTITLEMENTS[0]!]) }),
    );
    renderTab();

    await screen.findByText('Seats');

    expect(screen.queryByRole('link', { name: 'Add entitlement' })).toBeNull();
  });
});

describe('giving a version a grant', () => {
  it("sends a number that adds to the license's, with no overage so that it inherits the license's", async () => {
    const bodies = serveAssign();
    renderTab('new');
    await choose('API Calls');

    await userEvent.type(await screen.findByLabelText(/Value per unit/), '1000');
    await userEvent.click(screen.getByRole('combobox', { name: /Combines with the license/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Add' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add entitlement' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      entitlementSlug: 'api-calls',
      overrideBehavior: 'ADD',
      value: { type: 'number', value: 1000 },
    });
    // The contract declares an integer and not a null: left empty, the member is not there.
    expect(bodies[0]).not.toHaveProperty('limitCapExceededOveragePercent');
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("sends the overage that was typed, which replaces the license's", async () => {
    const bodies = serveAssign();
    renderTab('new');
    await choose('API Calls');

    await userEvent.type(await screen.findByLabelText(/Value per unit/), '1000');
    await userEvent.type(screen.getByLabelText(/Overage allowance/), '20');
    await userEvent.click(await screen.findByRole('button', { name: 'Add entitlement' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      limitCapExceededOveragePercent: 20,
      overrideBehavior: 'MAX',
    });
  });

  it("sends a flag as enabled, with none of the members of a number", async () => {
    const bodies = serveAssign();
    renderTab('new');
    await choose('Advanced Analytics');

    await userEvent.click(await screen.findByRole('button', { name: 'Add entitlement' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      entitlementSlug: 'advanced-analytics',
      value: { type: 'boolean', value: true },
    });
  });

  it('asks for an entitlement before it asks the API: nothing is sent while none is chosen', async () => {
    const bodies = serveAssign();
    renderTab('new');

    expect(await screen.findByRole('button', { name: 'Add entitlement' })).toBeDisabled();
    expect(bodies).toEqual([]);
  });

  it('asks for a value before it asks the API, and says what is wrong with it', async () => {
    const bodies = serveAssign();
    renderTab('new');
    await choose('API Calls');
    const value = await screen.findByLabelText(/Value per unit/);

    await userEvent.type(value, '1.5');
    await userEvent.tab();

    expect(await screen.findByText('Enter a whole number, 0 or more, or choose unlimited.')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Add entitlement' }));
    expect(bodies).toEqual([]);
  });

  it('shows the refusal of a value on its field, with the words of the API', async () => {
    serveAssign(() =>
      refusal(422, {
        code: 'AssignAddonEntitlement.InvalidValue',
        detail: 'value.type must be "number" for NUMBER entitlements',
      }),
    );
    renderTab('new');
    await choose('API Calls');
    await userEvent.type(await screen.findByLabelText(/Value per unit/), '1000');

    await userEvent.click(await screen.findByRole('button', { name: 'Add entitlement' }));

    expect(await screen.findByText('value.type must be "number" for NUMBER entitlements')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leads to a new version when an instance with a live subscription holds this one', async () => {
    serveAssign(() =>
      refusal(409, {
        code: 'AssignAddonEntitlement.BillingActive',
        detail: 'an instance with a live subscription holds this add-on version',
      }),
    );
    renderTab('new');
    await choose('API Calls');
    await userEvent.type(await screen.findByLabelText(/Value per unit/), '1000');

    await userEvent.click(await screen.findByRole('button', { name: 'Add entitlement' }));

    const frozen = await screen.findByRole('alertdialog');
    expect(within(frozen).getByRole('link', { name: 'Create a new version' })).toHaveAttribute(
      'href',
      '/addons/new?family=extra-seats',
    );
    expect(within(frozen).getByRole('note')).toHaveTextContent(
      'an instance with a live subscription holds this add-on version',
    );
  });
});

describe("the overage a grant allows, against the license's", () => {
  // The default version of the compatible family grants the calls with a 50% overage.
  const serveLicense = (percent: number) => {
    const pro = buildLicense({
      description: 'Pro',
      id: 'license-pro-v2',
      name: 'Pro',
      slug: 'pro-v2',
      type: 'PAID',
    });
    server.use(
      handleListAddonCompatibility({ body: { familySlugs: ['pro'] } }),
      handleListLicenseFamilies({ body: pageOf([licenseFamily('pro', pro)]) }),
      handleGetLicenseEntitlements({
        body: pageOf([
          buildGrant({
            entitlement: API_CALLS,
            license: pro,
            overagePercent: percent,
            value: 100_000,
          }),
        ]),
      }),
    );
  };

  it("is warned about when the own overage of the add-on is lower, and about nothing else", async () => {
    serveLicense(50);
    renderTab('new');
    await choose('API Calls');
    await userEvent.type(await screen.findByLabelText(/Value per unit/), '1000');
    const overage = screen.getByLabelText(/Overage allowance/);

    await userEvent.type(overage, '20');
    expect(await screen.findByTestId('license-overage-warning')).toHaveTextContent('50');
    expect(screen.getByTestId('license-overage-warning')).toHaveTextContent('20');
    expect(screen.getByTestId('license-overage-warning')).toHaveTextContent('Pro');

    await userEvent.clear(overage);
    await userEvent.type(overage, '80');
    await waitFor(() => expect(screen.queryByTestId('license-overage-warning')).toBeNull());

    // Left empty, it inherits: nothing is lowered.
    await userEvent.clear(overage);
    await waitFor(() => expect(screen.queryByTestId('license-overage-warning')).toBeNull());
  });

  it('is not warned about when the session may not read licenses', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons', 'write:addons']));
    serveLicense(50);
    renderTab('new');
    await choose('API Calls');
    await userEvent.type(await screen.findByLabelText(/Value per unit/), '1000');

    await userEvent.type(screen.getByLabelText(/Overage allowance/), '20');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByTestId('license-overage-warning')).toBeNull();
  });
});

describe('editing and removing a grant', () => {
  it('opens a grant on its values, and replaces it with what was changed', async () => {
    const bodies: unknown[] = [];
    server.use(
      handleUpdateAddonEntitlement(async ({ request }) => {
        bodies.push(await request.json());

        return HttpResponse.json(seatsGrant());
      }),
    );
    renderTab('seats');

    const value = await screen.findByLabelText(/Value per unit/);
    expect(value).toHaveValue('5');
    await userEvent.clear(value);
    await userEvent.type(value, '8');
    await userEvent.click(await screen.findByRole('button', { name: 'Save entitlement' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      overrideBehavior: 'ADD',
      value: { type: 'number', value: 8 },
    });
  });

  it('leaves a link to a grant the version does not have, and one to a dialog that cannot open', async () => {
    renderTab('ghost');

    expect(await screen.findByTestId('left')).toHaveAttribute('data-to', '/addons/$addonSlug/entitlements');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before it takes a grant away, and removes it once confirmed', async () => {
    const removed = vi.fn();
    server.use(
      handleUnassignAddonEntitlement(({ params }) => {
        removed(params.entitlementSlug);

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Seats' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(removed).not.toHaveBeenCalled();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removed).toHaveBeenCalledWith('seats'));
  });

  it('leads to a new version when the version cannot be changed, and says why', async () => {
    server.use(
      handleUnassignAddonEntitlement(() =>
        refusal(409, {
          code: 'UnassignAddonEntitlement.BillingActive',
          detail: 'a live subscription holds this add-on version',
        }),
      ),
    );
    renderTab();

    await userEvent.click(await screen.findByRole('button', { name: 'Remove Seats' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.getAllByRole('alertdialog').some((candidate) => within(candidate).queryByRole('link', { name: 'Create a new version' }))).toBe(true));
  });
});
