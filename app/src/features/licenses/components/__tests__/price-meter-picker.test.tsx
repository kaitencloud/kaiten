import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { testI18n } from '@/__tests__/test-i18n';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  buildEntitlement,
  buildGrant,
  buildLicense,
} from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { getMeterOptions } from '../../utils/license-price.utils';
import { PriceMeterPicker } from '../prices/price-meter-picker';

const getAuthToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('@/test-fixtures/billing-test-support')).createRouterModule(
    vi.fn(),
  ),
);

useBillingTexts();

beforeEach(() => {
  getAuthToken.mockResolvedValue(sessionToken(['read:addons']));
});

const license = buildLicense({
  description: 'Pro',
  id: 'license-pro',
  name: 'Pro',
  slug: 'pro-v4',
  type: 'PAID',
});
const traces = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Traces',
  resetPeriod: 'MONTH',
  saleUnit: { factor: 100_000, label: '100,000 traces' },
  slug: 'traces',
  unit: { plural: 'traces', singular: 'trace' },
});
const requests = buildEntitlement({
  aggregationMethod: 'COUNT',
  name: 'Requests',
  resetPeriod: 'DAY',
  saleUnit: { factor: 1_000, label: '1k requests' },
  slug: 'requests',
  unit: { plural: 'requests', singular: 'request' },
});
const seats = buildEntitlement({
  aggregationMethod: 'SUM',
  name: 'Seats',
  slug: 'seats',
  unit: { plural: 'seats', singular: 'seat' },
});

const entitlements = [traces, requests, seats];
const grants = [
  buildGrant({
    entitlement: traces,
    license,
    overagePercent: 100,
    value: 100_000,
  }),
  buildGrant({ entitlement: requests, license, overagePercent: 0, value: 1_000 }),
  buildGrant({ entitlement: seats, license, overagePercent: 0, value: 10 }),
];

const renderPicker = (
  model: 'USAGE_BASED' | 'OVERAGE',
  onSelect = vi.fn(),
  value = '',
) =>
  renderWithClient(
    <PriceMeterPicker
      model={model}
      onSelect={onSelect}
      options={getMeterOptions({ entitlements, grants, model, prices: [] })}
      value={value}
    />,
  );

const optionOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('PriceMeterPicker', () => {
  it('lists the flows to pick and the stock disabled, with what each is', () => {
    renderPicker('USAGE_BASED');

    expect(optionOf('Traces')).toBeEnabled();
    expect(within(optionOf('Traces')).getByText('Summed, resets every month')).toBeInTheDocument();
    expect(within(optionOf('Requests')).getByText('Counted, resets every day')).toBeInTheDocument();
    // A choice that cannot be made is disabled for what it does and not for what
    // it says: it stays reachable, named by its label and described by its reason.
    expect(optionOf('Seats')).toHaveAttribute('aria-disabled', 'true');
    expect(optionOf('Seats')).toHaveAccessibleDescription(
      'A stock: it never resets, so it cannot be metered.',
    );
    expect(
      within(optionOf('Seats')).getByText(
        'A stock: it never resets, so it cannot be metered.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/is sold as an add-on/)).toBeInTheDocument();
  });

  it('names the unit each flow is sold in, and none for a stock', () => {
    renderPicker('USAGE_BASED');

    expect(within(optionOf('Traces')).getByText('per 100,000 traces')).toBeInTheDocument();
    expect(within(optionOf('Requests')).getByText('per 1k requests')).toBeInTheDocument();
    expect(within(optionOf('Seats')).queryByText(/^per /)).toBeNull();
  });

  it('says what an overage bills against, and why it cannot on a hard limit', () => {
    renderPicker('OVERAGE');

    expect(
      within(optionOf('Traces')).getByText(
        'Bills above 100,000 traces/month, up to 200,000',
      ),
    ).toBeInTheDocument();
    expect(optionOf('Requests')).toHaveAttribute('aria-disabled', 'true');
    expect(optionOf('Requests')).toHaveAccessibleDescription(
      /^Overage cannot occur on this grant/,
    );
    expect(
      within(optionOf('Requests')).getByText(
        'Overage cannot occur on this grant: its limit is hard or unlimited.',
      ),
    ).toBeInTheDocument();
  });

  it('marks the one picked, and hands the entitlement picked to the form', async () => {
    const onSelect = vi.fn();
    renderPicker('USAGE_BASED', onSelect, 'requests');

    expect(optionOf('Requests')).toHaveAttribute('aria-pressed', 'true');
    expect(optionOf('Traces')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(optionOf('Traces'));
    expect(onSelect).toHaveBeenCalledWith('traces');
  });

  it('does not hand a stock to the form', async () => {
    const onSelect = vi.fn();
    renderPicker('USAGE_BASED', onSelect);

    await userEvent.click(optionOf('Seats'));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('says so when the version grants nothing a price can meter', () => {
    renderWithClient(
      <PriceMeterPicker
        model="USAGE_BASED"
        onSelect={() => undefined}
        options={[]}
        value=""
      />,
    );

    expect(
      screen.getByText(/This version grants no entitlement a price can meter/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is sold as an add-on/)).toBeNull();
  });

  it('reads in French', async () => {
    await testI18n.changeLanguage('fr');
    renderPicker('OVERAGE');

    expect(
      within(optionOf('Traces')).getByText(
        'Facture au-delà de 100 000 traces/mois, jusqu’à 200 000',
      ),
    ).toBeInTheDocument();
    expect(
      within(optionOf('Requests')).getByText(
        'Le dépassement ne peut pas survenir sur cet octroi : sa limite est dure ou illimitée.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/se vend comme un add-on/)).toBeInTheDocument();
    await testI18n.changeLanguage('en');
  });
});

describe('the way a stock is sold, said under the entitlements that cannot be metered', () => {
  const hint = /is sold as an add-on with a quantity, not metered\./;

  /** Waits for what the page reads (the capabilities, the scopes) before the hint is read. */
  const settled = async (client: { isFetching: () => number }) =>
    waitFor(() => expect(client.isFetching()).toBe(0));

  it('links to the add-ons where the release ships them and the session may read them', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithAddons(),
      }),
    );
    renderPicker('USAGE_BASED');

    expect(await screen.findByRole('link', { name: 'See the add-ons' })).toHaveAttribute(
      'href',
      '/addons',
    );
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('names the way and links nowhere where the release has no add-ons', async () => {
    server.use(
      handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    );
    const { client } = renderPicker('USAGE_BASED');
    await settled(client);

    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links nowhere to a session that may not read the add-ons', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:licenses']));
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithAddons(),
      }),
    );
    const { client } = renderPicker('USAGE_BASED');
    await settled(client);

    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links in French too', async () => {
    await testI18n.changeLanguage('fr');
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.stackWithAddons(),
      }),
    );
    renderPicker('USAGE_BASED');

    expect(await screen.findByRole('link', { name: 'Voir les add-ons' })).toHaveAttribute(
      'href',
      '/addons',
    );
    await testI18n.changeLanguage('en');
  });
});
