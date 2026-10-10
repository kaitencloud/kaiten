import { useQuery } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import type { AnchorHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { InstanceAddon } from '@/api-client';
import {
  handleDetachInstanceAddon,
  handleGetBillingCapabilities,
  handleGetEntitlementsUsageMetrics,
  handleListAddons,
  handleListInstanceAddons,
  handleSetInstanceAddonQuantity,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../../../../../e2e/app/_support/model/billing-capabilities';
import { instanceUsageQueryOptions } from '../../../../../../hooks/instance-detail/instance-detail-query-options';
import { INSTANCE, subscription } from '../../__tests__/lifecycle-fixtures';
import { InstanceAddonsCard } from '../instance-addons-card';
import {
  heldSeats,
  SEATS_V1,
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
  Link: ({
    children,
    params,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    params?: unknown;
    to: string;
  }) => (
    <a {...props} data-params={JSON.stringify(params)} href={to}>
      {children}
    </a>
  ),
}));

useBillingTexts();

const SCOPES = [
  'read:billing',
  'read:instances',
  'write:instances',
  'read:addons',
  'read:licenses',
];
const NOTE = 'Entitlement changes now; billed from the next renewal; no proration or refund.';

/** The instance, with the catalogue of entitlements that names what an add-on did to it. */
beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(SCOPES));
  detail.current = {
    entitlements: [
      { name: 'Seats', slug: 'seats' },
      { name: 'Storage', slug: 'storage-gb' },
    ],
    instance: INSTANCE,
    license: { familyId: 'family-business', lifecycleState: 'PUBLISHED', name: 'Business' },
  };
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleListAddons({ body: pageOf([SEATS_V1, STORAGE_V1]) }),
  );
});

/**
 * The add-ons the instance holds, which the steps and the removals change as the API
 * does, and the effective seats the instance reads with them: the ten its license
 * grants, and five a unit.
 */
function serveHeld(initial: InstanceAddon[]) {
  const seatsOf = (held: InstanceAddon[]) =>
    10 + 5 * (held.find(({ addonSlug }) => addonSlug === 'extra-seats-v1')?.quantity ?? 0);
  const state = { held: initial };
  const requests: Array<{ body?: unknown; method: string; slug: string }> = [];
  server.use(
    handleListInstanceAddons(() => HttpResponse.json(state.held)),
    handleGetEntitlementsUsageMetrics(() =>
      HttpResponse.json([usageOf('seats', seatsOf(state.held)), usageOf('storage-gb', 50)]),
    ),
    handleSetInstanceAddonQuantity(async ({ params, request }) => {
      const body = (await request.json()) as { quantity: number };
      requests.push({ body, method: 'PATCH', slug: String(params.addonSlug) });
      state.held = state.held.map((held) =>
        held.addonSlug === params.addonSlug ? { ...held, quantity: body.quantity } : held,
      );

      return HttpResponse.json(state.held.find(({ addonSlug }) => addonSlug === params.addonSlug));
    }),
    handleDetachInstanceAddon(({ params }) => {
      requests.push({ method: 'DELETE', slug: String(params.addonSlug) });
      state.held = state.held.filter(({ addonSlug }) => addonSlug !== params.addonSlug);

      return new HttpResponse(null, { status: 204 });
    }),
  );

  return { requests, state };
}

// The page around the card reads the usage of the instance, and the card reads what
// it has in the cache: the observer stands in for the page.
function UsageObserver() {
  useQuery(instanceUsageQueryOptions(INSTANCE.slug));

  return null;
}

const renderCard = (value = subscription() as Parameters<typeof InstanceAddonsCard>[0]['subscription']) =>
  renderWithClient(
    <>
      <UsageObserver />
      <InstanceAddonsCard instanceSlug={INSTANCE.slug} subscription={value} />
    </>,
  );

/** Lets what a screen that is not drawn would have asked for go out, so that its absence says something. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

const stepper = () => screen.findByRole('group', { name: 'Quantity of Extra seats' });
const more = async () =>
  within(await stepper()).getByRole('button', { name: 'One unit more of Extra seats' });
const fewer = async () =>
  within(await stepper()).getByRole('button', { name: 'One unit fewer of Extra seats' });

describe('where the card is drawn', () => {
  it('is not drawn where the release has no add-ons, and asks nothing', async () => {
    const asked = vi.fn();
    server.use(
      handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
      handleListInstanceAddons(() => {
        asked();

        return HttpResponse.json([]);
      }),
    );
    renderCard();

    await settle();

    expect(screen.queryByTestId('instance-addons')).toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });

  it('is not drawn for a session that may not read the add-ons of an instance', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons']));
    const asked = vi.fn();
    server.use(
      handleListInstanceAddons(() => {
        asked();

        return HttpResponse.json([heldSeats()]);
      }),
    );
    renderCard();
    await settle();

    expect(screen.queryByTestId('instance-addons')).toBeNull();
    expect(asked).not.toHaveBeenCalled();
  });

  it('is not drawn for an instance nobody bills that holds none', async () => {
    serveHeld([]);
    renderCard(null);
    await settle();

    expect(screen.queryByTestId('instance-addons')).toBeNull();
  });

  it('is drawn for an instance nobody bills that holds one, to be read and taken off', async () => {
    serveHeld([heldSeats({ prices: [] })]);
    renderCard(null);

    expect(await screen.findByTestId('instance-addons')).toBeInTheDocument();
    expect(screen.getByText('Not billed')).toBeInTheDocument();
    // Nothing is added to an instance that is not billed: it is with its subscription.
    expect(screen.queryByRole('link', { name: 'Add an add-on' })).toBeNull();
    expect(screen.getByTestId('addons-not-live')).toBeInTheDocument();
  });

  it('says what a failed read was, with a way to ask again', async () => {
    let calls = 0;
    server.use(
      handleListInstanceAddons(() => {
        calls += 1;

        return calls === 1
          ? refusal(503, { detail: 'the add-ons are unavailable' })
          : HttpResponse.json([heldSeats()]);
      }),
    );
    renderCard();

    expect(await screen.findByTestId('instance-addons-error')).toHaveTextContent(
      'the add-ons are unavailable',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Extra seats')).toBeInTheDocument();
  });
});

describe('what the card lists', () => {
  it('says what the instance holds: the version, its slug, its quantity, what a unit costs and since when', async () => {
    serveHeld([heldSeats()]);
    renderCard();

    const card = await screen.findByTestId('instance-addons');
    await within(card).findByText('Extra seats');

    expect(within(card).getByText('extra-seats-v1')).toBeInTheDocument();
    expect(within(await stepper()).getByTestId('quantity-value')).toHaveTextContent('2');
    expect(within(card).getByText('$10.00')).toBeInTheDocument();
    expect(within(card).getByText('/month')).toBeInTheDocument();
    expect(within(card).getByTestId('addons-note')).toHaveTextContent(NOTE);
  });

  it('names an add-on by the name its attachment carries, with no read of the catalogue', async () => {
    getAuthToken.mockResolvedValue(
      sessionToken(['read:billing', 'read:instances', 'write:instances']),
    );
    const catalogue = vi.fn();
    server.use(
      handleListAddons(() => {
        catalogue();

        return HttpResponse.json(pageOf([SEATS_V1]));
      }),
    );
    serveHeld([heldSeats()]);
    renderCard();

    expect(await screen.findByText('Extra seats')).toBeInTheDocument();
    expect(screen.getByText('extra-seats-v1')).toBeInTheDocument();
    await settle();
    expect(catalogue).not.toHaveBeenCalled();
  });

  it('says an add-on that was withdrawn from sale since is kept until it is removed', async () => {
    server.use(
      handleListAddons({ body: pageOf([{ ...SEATS_V1, lifecycleState: 'ARCHIVED' }]) }),
    );
    serveHeld([heldSeats()]);
    renderCard();

    expect(await screen.findByText('Withdrawn')).toBeInTheDocument();
  });

  it.each([
    ['FREE', 'Free'],
    ['CUSTOM', 'On request'],
  ] as const)('says a %s add-on costs what it does, since it has no price', async (pricingType, label) => {
    server.use(handleListAddons({ body: pageOf([{ ...SEATS_V1, pricingType }]) }));
    serveHeld([heldSeats({ prices: [] })]);
    renderCard();

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it('says there is none, for an instance that holds none and is billed', async () => {
    serveHeld([]);
    renderCard();

    expect(await screen.findByTestId('instance-addons-empty')).toHaveTextContent('No add-on');
    expect(screen.getByTestId('addons-note')).toBeInTheDocument();
  });
});

describe('adding an add-on', () => {
  it.each(['TRIAL', 'ACTIVE', 'PAST_DUE'] as const)(
    'is offered while the subscription is %s',
    async (status) => {
      serveHeld([heldSeats()]);
      renderCard(subscription({ status }));

      const link = await screen.findByRole('link', { name: 'Add an add-on' });

      expect(link).toHaveAttribute(
        'href',
        '/customers/instances/$instanceSlug/billing/attach-addon',
      );
      expect(screen.queryByTestId('addons-not-live')).toBeNull();
    },
  );

  it('is not offered once the subscription ended, which says why', async () => {
    serveHeld([heldSeats()]);
    renderCard(subscription({ status: 'CANCELED' }));

    expect(await screen.findByTestId('addons-not-live')).toHaveTextContent(
      'Add-ons can be added while the subscription is live',
    );
    expect(screen.queryByRole('link', { name: 'Add an add-on' })).toBeNull();
    // What it holds can still be stepped and removed.
    expect(await stepper()).toBeInTheDocument();
  });

  it.each([
    ['write:instances', ['read:billing', 'read:instances', 'read:addons', 'read:licenses']],
    ['read:addons', ['read:billing', 'read:instances', 'write:instances', 'read:licenses']],
    ['read:licenses', ['read:billing', 'read:instances', 'write:instances', 'read:addons']],
  ])('is not offered to a session without %s', async (_scope, scopes) => {
    getAuthToken.mockResolvedValue(sessionToken(scopes));
    serveHeld([heldSeats()]);
    renderCard();

    await screen.findByTestId('instance-addons');
    expect(screen.queryByRole('link', { name: 'Add an add-on' })).toBeNull();
  });
});

describe('the quantity of an add-on', () => {
  it('goes up one unit a click, in one request, and the toast says what it did to the entitlements', async () => {
    const { requests } = serveHeld([heldSeats()]);
    renderCard();

    await userEvent.click(await more());

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(requests).toEqual([
      { body: { quantity: 3 }, method: 'PATCH', slug: 'extra-seats-v1' },
    ]);
    // Ten seats the license grants and five a unit: twenty, then twenty-five.
    expect(toast.success).toHaveBeenCalledWith('Extra seats: now × 3', {
      description: 'Seats: 20 → 25',
    });
  });

  it('stops at the most the version allows: the button is off, and no request is made past it', async () => {
    const { requests } = serveHeld([heldSeats({ quantity: 2 })]);
    renderCard();

    await userEvent.click(await more());
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: 'Quantity of Extra seats' })).getByTestId('quantity-value')).toHaveTextContent('3'),
    );

    expect(await more()).toBeDisabled();
    expect(requests).toHaveLength(1);
  });

  it('goes down one unit a click, and stops at one', async () => {
    const { requests } = serveHeld([heldSeats({ quantity: 2 })]);
    renderCard();

    await userEvent.click(await fewer());
    await waitFor(() =>
      expect(within(screen.getByRole('group', { name: 'Quantity of Extra seats' })).getByTestId('quantity-value')).toHaveTextContent('1'),
    );

    expect(await fewer()).toBeDisabled();
    expect(requests).toEqual([{ body: { quantity: 1 }, method: 'PATCH', slug: 'extra-seats-v1' }]);
  });

  it('shows the words of a refusal, and the quantity goes back to the one the API holds', async () => {
    serveHeld([heldSeats({ quantity: 2 })]);
    server.use(
      handleSetInstanceAddonQuantity(() =>
        refusal(422, {
          code: 'SetInstanceAddonQuantity.QuantityExceedsMax',
          detail: 'this add-on allows at most 3 units',
        }),
      ),
    );
    renderCard();

    await userEvent.click(await more());

    expect(await screen.findByRole('alert')).toHaveTextContent('this add-on allows at most 3 units');
    expect(within(await stepper()).getByTestId('quantity-value')).toHaveTextContent('2');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('is only read by a session that may not change it', async () => {
    getAuthToken.mockResolvedValue(
      sessionToken(['read:billing', 'read:instances', 'read:addons']),
    );
    serveHeld([heldSeats()]);
    renderCard();

    await screen.findByText('Extra seats');

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('button', { name: /One unit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });

  it('waits out a period that is being closed and makes the same change again', async () => {
    const bodies: unknown[] = [];
    serveHeld([heldSeats()]);
    server.use(
      handleSetInstanceAddonQuantity(async ({ request }) => {
        bodies.push(await request.json());

        return bodies.length === 1
          ? HttpResponse.json(
              {
                code: 'SetInstanceAddonQuantity.BoundaryPending',
                detail: 'the period has ended and is being closed; retry in a minute',
                status: 409,
              },
              { headers: { 'Retry-After': '1' }, status: 409 },
            )
          : HttpResponse.json(heldSeats({ quantity: 3 }));
      }),
    );
    renderCard();

    await userEvent.click(await more());

    expect(await screen.findByTestId('boundary-closing')).toHaveTextContent('Closing the period');
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 4000 });
    expect(bodies).toEqual([{ quantity: 3 }, { quantity: 3 }]);
    expect(screen.queryByTestId('boundary-closing')).toBeNull();
  });
});

describe('taking an add-on off', () => {
  const remove = async () => userEvent.click(await screen.findByRole('button', { name: 'Remove Extra seats' }));
  const confirm = () => screen.findByRole('button', { name: 'Remove' });

  it('asks first, and says the period under way is not refunded and the add-on is no longer billed from the next invoice', async () => {
    const { requests } = serveHeld([heldSeats()]);
    renderCard();

    await remove();
    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText('Remove Extra seats from this instance?')).toBeInTheDocument();
    expect(within(dialog).getByTestId('remove-addon-billing')).toHaveTextContent(
      'The current period is not refunded, and the add-on is no longer billed from the next invoice.',
    );
    expect(requests).toEqual([]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(requests).toEqual([]);
  });

  it('says an add-on billed in arrears is still billed for the period, in full', async () => {
    serveHeld([
      heldSeats({
        prices: [
          {
            ...heldSeats().prices[0]!,
            billingTiming: 'ARREARS',
          },
        ],
      }),
    ]);
    renderCard();

    await remove();

    expect(await screen.findByTestId('remove-addon-billing')).toHaveTextContent(
      'billed in arrears: the period under way is still billed in full',
    );
  });

  it('removes it once confirmed, in one request, and the list no longer holds it', async () => {
    const { requests } = serveHeld([heldSeats()]);
    renderCard();

    await remove();
    await userEvent.click(await confirm());

    await waitFor(() => expect(requests).toEqual([{ method: 'DELETE', slug: 'extra-seats-v1' }]));
    expect(await screen.findByTestId('instance-addons-empty')).toBeInTheDocument();
    expect(toast.success.mock.calls[0]?.[0]).toBe('Extra seats removed');
  });

  it('shows the words of a refusal above the list, with a way to ask again', async () => {
    const { state } = serveHeld([heldSeats()]);
    let calls = 0;
    server.use(
      handleDetachInstanceAddon(() => {
        calls += 1;
        if (calls === 1) {
          return refusal(503, { detail: 'the add-ons are unavailable' });
        }
        state.held = [];

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderCard();

    await remove();
    await userEvent.click(await confirm());

    expect(await screen.findByRole('alert')).toHaveTextContent('the add-ons are unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('instance-addons-empty')).toBeInTheDocument();
  });
});

describe('what an add-on did to what the instance is entitled to', () => {
  it('says nothing of it when no effective value changed', async () => {
    serveHeld([heldSeats({ quantity: 2 })]);
    // The usage the API composes does not move with this attachment.
    server.use(
      handleGetEntitlementsUsageMetrics({ body: [usageOf('seats', 20), usageOf('storage-gb', 50)] }),
    );
    renderCard();

    await userEvent.click(await more());

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('Extra seats: now × 3', undefined);
  });

  it('names an entitlement the catalogue does not know by its slug', async () => {
    detail.current = { ...detail.current, entitlements: [] };
    serveHeld([heldSeats()]);
    renderCard();

    await userEvent.click(await more());

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith('Extra seats: now × 3', {
      description: 'seats: 20 → 25',
    });
  });
});
