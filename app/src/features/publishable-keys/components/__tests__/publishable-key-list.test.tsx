import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useBillingTexts } from '@/test-fixtures/billing-test-support';
import { PublishableKeysPageContent } from '..';
import {
  READ_ONLY_SCOPES,
  renderScreen,
  serveKeys,
  sessionWith,
} from './publishable-key-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./publishable-key-test-support')).createRouterModule(navigate),
);

useBillingTexts();

beforeEach(() => {
  navigate.mockReset();
  getAuthToken.mockResolvedValue(sessionWith());
});

const page = (includeRevoked = false, onChange = vi.fn()) =>
  renderScreen(
    <PublishableKeysPageContent
      includeRevoked={includeRevoked}
      onIncludeRevokedChange={onChange}
    />,
  );

const row = (label: string) =>
  screen.getByRole('row', { name: new RegExp(label) });

describe('the list of publishable keys', () => {
  it('lists the live keys with what tells them apart, and never a key', async () => {
    serveKeys();
    page();

    expect(await screen.findByRole('row', { name: /pricing/ })).toBeVisible();
    const pricing = row('pricing');
    expect(within(pricing).getByText('…a1B2')).toBeVisible();
    expect(within(pricing).getByText('https://shop.acme.test')).toBeVisible();
    expect(within(pricing).getByText('Live')).toBeVisible();
    expect(within(row('Renderer')).getByText('No browser origin')).toBeVisible();
    expect(within(row('Renderer')).getByText('Never used')).toBeVisible();
    expect(screen.queryByText(/Legacy checkout/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/pk_/);
  });

  it('says in a few words what a key is for, and leads to the switches that decide what it lists', async () => {
    serveKeys();
    page();

    const intro = await screen.findByTestId('publishable-keys-intro');
    expect(intro).toHaveTextContent(/X-Kaiten-Publishable-Key/);
    expect(intro).toHaveTextContent(/GET \/public\/catalog/);
    expect(
      await within(intro).findByRole('link', { name: 'License families' }),
    ).toHaveAttribute('href', '/licenses');
    // The add-ons are not shipped by this release.
    expect(
      within(intro).queryByRole('link', { name: 'Add-on families' }),
    ).not.toBeInTheDocument();
  });

  it('asks the API for the revoked keys when the page says so, and shows them as revoked', async () => {
    const requested = serveKeys();
    page(true);

    expect(await screen.findByText('Legacy checkout')).toBeVisible();
    expect(within(row('Legacy checkout')).getByText('Revoked')).toBeVisible();
    expect(requested).toEqual(['true']);
    // A revoked key can no longer change: it has no action.
    expect(
      within(row('Legacy checkout')).queryByRole('link'),
    ).not.toBeInTheDocument();
    expect(
      within(row('Legacy checkout')).queryByRole('button', { name: /Revoke/ }),
    ).not.toBeInTheDocument();
  });

  it('asks the page to include the revoked keys when the switch is turned on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    serveKeys();
    page(false, onChange);

    await user.click(
      await screen.findByRole('switch', { name: 'Include revoked' }),
    );

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('folds away the origins past the third, and opens them on request', async () => {
    const user = userEvent.setup();
    serveKeys();
    page();

    const storefront = await screen.findByRole('row', { name: /Storefront/ });
    expect(within(storefront).queryByText('https://asia.store.acme.test')).toBeNull();

    await user.click(
      within(storefront).getByRole('button', { name: 'Show 2 more' }),
    );

    expect(within(storefront).getByText('https://asia.store.acme.test')).toBeVisible();
    expect(
      within(storefront).getByRole('button', { name: 'Show fewer' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('searches by label, by the end of the key and by origin', async () => {
    const user = userEvent.setup();
    serveKeys();
    page();
    await screen.findByRole('row', { name: /pricing/ });
    const search = screen.getByRole('textbox');

    await user.type(search, 'c3D4');
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /pricing/ })).toBeNull(),
    );
    expect(row('Storefront')).toBeVisible();

    await user.clear(search);
    await user.type(search, 'shop.acme');
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Storefront/ })).toBeNull(),
    );
    expect(row('pricing')).toBeVisible();
  });

  it('offers to issue a key, to edit one and to revoke one to a session that may write them', async () => {
    serveKeys();
    page();

    expect(
      await screen.findByRole('link', { name: 'New publishable key' }),
    ).toHaveAttribute('href', '/integrations/publishable-keys/new');
    expect(
      within(row('pricing')).getByRole('link', { name: 'Edit pricing' }),
    ).toHaveAttribute('href', '/integrations/publishable-keys/pk-1/edit');
    expect(
      within(row('pricing')).getByRole('button', { name: 'Revoke pricing' }),
    ).toBeVisible();
  });

  it('offers none of them to a session that may only read the keys', async () => {
    getAuthToken.mockResolvedValue(sessionWith(READ_ONLY_SCOPES));
    serveKeys();
    page();

    expect(await screen.findByRole('row', { name: /pricing/ })).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'New publishable key' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edit/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Revoke/ }),
    ).not.toBeInTheDocument();
  });

  it('says where a key comes from when there is none, with the way to issue one', async () => {
    serveKeys([]);
    page();

    const empty = await screen.findByTestId('publishable-keys-empty');
    expect(empty).toHaveTextContent('No publishable key yet');
    expect(
      await within(empty).findByRole('link', { name: 'New publishable key' }),
    ).toBeVisible();
  });
});
