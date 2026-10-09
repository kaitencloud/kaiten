import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { BillingCapabilities } from '@/api-client';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  billingCapabilitiesProfiles,
  stripeProvider,
} from '../../../../e2e/app/_support/model/billing-capabilities';
import { useBillingProvider } from '../hooks';
import {
  canChargeAutomatically,
  findBillingProvider,
  getProviderStanding,
  isProviderOffered,
  STRIPE_CONNECTOR_NAME,
  STRIPE_CONNECTOR_ROUTE_ID,
} from '../logic';

// Where a payment provider stands is read from the `providers` of the
// capabilities. `features.stripe`, `chargeAutomatically` and `publicSurface` say what the
// release ships, and the API answers them true on every organization whatever a provider
// can do here, so none of these reads them.

const withStripe = (standing: Parameters<typeof stripeProvider>[0]) =>
  billingCapabilitiesProfiles.stackWithStripe(standing);

describe('the Stripe connector', () => {
  it('is the connector the route id "stripe" stands for', () => {
    expect(STRIPE_CONNECTOR_NAME).toBe('kaiten.integration.billing.stripe');
    expect(STRIPE_CONNECTOR_ROUTE_ID).toBe('stripe');
  });
});

describe('finding a provider', () => {
  it('finds the entry of a kind among those the API lists', () => {
    expect(
      findBillingProvider(withStripe('connected'), 'STRIPE')?.kind,
    ).toBe('STRIPE');
    expect(findBillingProvider(withStripe('connected'), 'NOOP')?.kind).toBe(
      'NOOP',
    );
  });

  it('finds nothing where the API does not list it, or where the capabilities are unknown', () => {
    expect(
      findBillingProvider(billingCapabilitiesProfiles.stack(), 'STRIPE'),
    ).toBeUndefined();
    expect(findBillingProvider(undefined, 'STRIPE')).toBeUndefined();
  });
});

describe('what a provider stands for', () => {
  it.each([
    ['connected', { livemode: false, state: 'connected' }],
    ['connectedLive', { livemode: true, state: 'connected' }],
    ['available', { state: 'available' }],
    ['notEntitled', { reason: 'NOT_ENTITLED', state: 'unavailable' }],
    ['vaultMissing', { reason: 'VAULT_NOT_CONFIGURED', state: 'unavailable' }],
  ] as const)('reads %s from its entry', (standing, expected) => {
    expect(getProviderStanding(stripeProvider(standing))).toEqual(expected);
  });

  it('reads a reason it does not know as unknown, and a provider that is not listed as unlisted', () => {
    expect(
      getProviderStanding({
        ...stripeProvider('notEntitled'),
        unavailableReason: undefined,
      }),
    ).toEqual({ reason: 'UNKNOWN', state: 'unavailable' });
    expect(getProviderStanding(undefined)).toEqual({ state: 'unlisted' });
  });

  it('offers a provider that is connected or can be, and none that cannot', () => {
    expect(isProviderOffered(stripeProvider('connected'))).toBe(true);
    expect(isProviderOffered(stripeProvider('available'))).toBe(true);
    expect(isProviderOffered(stripeProvider('vaultMissing'))).toBe(false);
    expect(isProviderOffered(stripeProvider('notEntitled'))).toBe(false);
    expect(isProviderOffered(undefined)).toBe(false);
  });

  it('keeps a provider that stays connected after its plan went, since its invoices still route there', () => {
    expect(
      isProviderOffered({
        ...stripeProvider('connected'),
        available: false,
        unavailableReason: 'NOT_ENTITLED',
      }),
    ).toBe(true);
  });
});

describe('charging automatically', () => {
  it('is possible when a connected provider charges by itself', () => {
    const capabilities = withStripe('connected');

    expect(capabilities.features.chargeAutomatically).toBe(true);
    expect(canChargeAutomatically(capabilities)).toBe(true);
  });

  it('is possible when a connected provider charges by itself, whatever the flag of the release says', () => {
    const capabilities = {
      ...withStripe('connected'),
      features: { ...withStripe('connected').features, chargeAutomatically: false },
    };

    expect(canChargeAutomatically(capabilities)).toBe(true);
  });

  it('is not possible while the release ships it but no connected provider charges', () => {
    const capabilities = withStripe('available');

    expect(capabilities.features.chargeAutomatically).toBe(true);
    expect(canChargeAutomatically(capabilities)).toBe(false);
  });

  it('is not possible while no provider that charges is connected', () => {
    expect(canChargeAutomatically(withStripe('available'))).toBe(false);
    expect(canChargeAutomatically(billingCapabilitiesProfiles.stack())).toBe(
      false,
    );
    expect(canChargeAutomatically(undefined)).toBe(false);
  });

  it('is not possible when the connected provider cannot charge', () => {
    const capabilities: BillingCapabilities = {
      ...withStripe('connected'),
      providers: withStripe('connected').providers.map((provider) => ({
        ...provider,
        capabilities: { ...provider.capabilities, automaticCollection: false },
      })),
    };

    expect(canChargeAutomatically(capabilities)).toBe(false);
  });
});

describe('useBillingProvider', () => {
  const render = (capabilities: BillingCapabilities) => {
    server.use(handleGetBillingCapabilities({ body: capabilities }));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    return renderHook(() => useBillingProvider('STRIPE'), { wrapper });
  };

  it('offers nothing while the capabilities load', () => {
    const { result } = render(withStripe('connected'));

    expect(result.current).toMatchObject({
      isConnected: false,
      isOffered: false,
      isPending: true,
      standing: { state: 'unlisted' },
    });
  });

  it('says where Stripe stands once they are in', async () => {
    const { result } = render(withStripe('connectedLive'));

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current).toMatchObject({
      isConnected: true,
      isOffered: true,
      standing: { livemode: true, state: 'connected' },
    });
  });

  it('still says why Stripe cannot be connected where billing is off for that very reason, and offers nothing', async () => {
    const { result } = render({
      ...billingCapabilitiesProfiles.disabled('NOT_ENTITLED'),
      providers: withStripe('notEntitled').providers,
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current).toMatchObject({
      isConnected: false,
      isOffered: false,
      listedStanding: { reason: 'NOT_ENTITLED', state: 'unavailable' },
      standing: { state: 'unlisted' },
    });
  });

  it('offers no provider where billing is off', async () => {
    const { result } = render(billingCapabilitiesProfiles.disabled());

    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current).toMatchObject({
      isConnected: false,
      isOffered: false,
      standing: { state: 'unlisted' },
    });
  });
});
