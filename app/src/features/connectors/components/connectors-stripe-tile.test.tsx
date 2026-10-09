import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilitiesProfiles,
  type StripeStanding,
} from '../../../../e2e/app/_support/model/billing-capabilities';
import { ConnectorsPageContent } from './connectors-page-content';

useBillingTexts();

/** The tile of Stripe in the catalog, whichever section it is in. */
const stripeTile = async () => {
  const name = await screen.findByText('Stripe');
  const card = name.closest('[data-slot="card"]');
  if (!(card instanceof HTMLElement)) {
    throw new Error('The tile of Stripe is not in a card');
  }

  return card;
};

function renderCatalog(onOpenStripe = vi.fn()) {
  renderWithClient(
    <ConnectorsPageContent
      attioSettings={null}
      onOpenDetail={() => {}}
      onOpenStripe={onOpenStripe}
    />,
  );

  return onOpenStripe;
}

function standing(state: StripeStanding) {
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithStripe(state),
    }),
  );
}

describe('the Stripe tile of the catalog', () => {
  it('offers to connect Stripe where the organization can, and opens its page', async () => {
    standing('available');
    const open = renderCatalog();

    const tile = await stripeTile();
    await within(tile).findByText('Available');
    const connect = within(tile).getByRole('button', { name: 'Connect' });
    expect(connect).toBeEnabled();
    await userEvent.click(connect);

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('lists Stripe among the connected connectors, with a way to manage it, once it is connected', async () => {
    standing('connected');
    const open = renderCatalog();

    const section = (
      await screen.findByRole('heading', { name: /Connected/ })
    ).closest('section');
    if (!(section instanceof HTMLElement)) {
      throw new Error('The connected section is missing');
    }
    const tile = await within(section).findByText('Stripe');
    expect(tile).toBeInTheDocument();
    const card = await stripeTile();
    await userEvent.click(within(card).getByRole('button', { name: 'Manage' }));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('says under its name why Stripe cannot be connected, and offers no way to try', async () => {
    standing('vaultMissing');
    const open = renderCatalog();

    const tile = await stripeTile();
    await within(tile).findByText('Stripe needs a configured Vault');
    expect(within(tile).getByText('Unavailable')).toBeInTheDocument();
    expect(within(tile).getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(open).not.toHaveBeenCalled();
  });

  it('says that the plan of the organization leaves Stripe out', async () => {
    standing('notEntitled');
    renderCatalog();

    const tile = await stripeTile();
    await within(tile).findByText('Not included in your plan');
    expect(within(tile).getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('gives the generic reason where billing is not there, or the API does not list Stripe', async () => {
    renderCatalog();

    const tile = await stripeTile();
    await within(tile).findByText('Not available on this deployment');
    expect(within(tile).getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('keeps the tile of the catalog until the capabilities are in, rather than call Stripe unavailable', async () => {
    server.use(
      handleGetBillingCapabilities(async () => {
        await delay('infinite');

        return HttpResponse.json(billingCapabilitiesProfiles.stackWithStripe());
      }),
    );
    renderCatalog();

    const tile = await stripeTile();
    expect(within(tile).getByText('Available')).toBeInTheDocument();
    expect(within(tile).getByText('Subscription billing')).toBeInTheDocument();
    expect(within(tile).queryByText('Unavailable')).toBeNull();
  });
});
