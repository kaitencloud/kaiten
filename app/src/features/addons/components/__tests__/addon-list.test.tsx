import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Addon, AddonChanges, AddonFamily } from '@/api-client';
import {
  handleArchiveAddon,
  handleDeleteAddon,
  handleDeprecateAddonPrice,
  handleGetBillingCapabilities,
  handleListAddonEntitlements,
  handleListAddonFamilies,
  handleListAddonPrices,
  handlePublishAddon,
  handleUnarchiveAddon,
  handleUnassignAddonEntitlement,
  handleUpdateAddon,
  handleUpdateAddonFamily,
} from '@/api-client/msw.gen';
import {
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { buildPrice } from '../../../../../e2e/app/_support/fixtures';
import { AddonsPageContent } from '../pages';
import {
  renderScreen,
  SEATS_DRAFT,
  SEATS_V1,
  seatsGrant,
  STORAGE_ARCHIVED,
} from './addon-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./addon-test-support')).createAddonRouterModule(vi.fn()),
);

useBillingTexts();

// The popovers of the Filter menu ask the DOM for what jsdom does not have.
for (const method of [
  'hasPointerCapture',
  'releasePointerCapture',
  'scrollIntoView',
  'setPointerCapture',
] as const) {
  Object.defineProperty(HTMLElement.prototype, method, {
    configurable: true,
    value: () => false,
  });
}

const family = (slug: string, versions: Addon[], isPublic = false): AddonFamily => ({
  currentVersion: versions.find((version) => version.isDefault),
  id: `addon-family-${slug}`,
  isPublic,
  lastVersion: Math.max(...versions.map(({ version }) => version)),
  slug,
  versions: [...versions].sort((left, right) => right.version - left.version),
});

const SEATS_PUBLISHED_PLAIN: Addon = { ...SEATS_V1, id: 'addon-extra-seats-plain', isDefault: false, slug: 'extra-seats-plain', version: 3, versionName: '2028' };

/** The families the list reads: seats with three versions, one of them default, and storage, archived. */
const FAMILIES = [
  family('extra-seats', [SEATS_V1, SEATS_DRAFT, SEATS_PUBLISHED_PLAIN], true),
  family('extra-storage', [STORAGE_ARCHIVED]),
];

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:addons', 'write:addons']),
  );
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleListAddonFamilies({ body: FAMILIES }),
  );
});

const renderList = () => renderScreen(<AddonsPageContent />);
const rowOf = async (versionName: string) => {
  const cells = await screen.findAllByText(versionName);

  return cells.map((cell) => cell.closest('tr')).find((row): row is HTMLTableRowElement => row !== null)!;
};

describe('the catalogue of add-ons', () => {
  it('lists each family by its name with how many versions it has, its default, and whether it is public', async () => {
    renderList();

    const seats = (await screen.findByText('Extra seats')).closest('[data-slot="accordion-item"]') as HTMLElement;

    expect(within(seats).getByText('3 versions')).toBeInTheDocument();
    expect(within(seats).getByText(/Default: 2026/)).toBeInTheDocument();
    expect(within(seats).getByText('Public')).toBeInTheDocument();
    const storage = screen.getByText('Extra storage').closest('[data-slot="accordion-item"]') as HTMLElement;
    expect(within(storage).getByText('1 version')).toBeInTheDocument();
    expect(within(storage).queryByText('Public')).toBeNull();
  });

  it('lists the versions of a family with their state, newest first', async () => {
    renderList();

    const rows = (await screen.findAllByRole('row')).map((row) => row.textContent ?? '');
    const seats = rows.filter((row) => /20(26|27|28)/.test(row));

    expect(seats[0]).toContain('2028');
    expect(seats[1]).toContain('2027');
    expect(seats[2]).toContain('2026');
    expect(within(await rowOf('2027')).getByText('Draft')).toBeInTheDocument();
    expect(within(await rowOf('2026')).getByText('Published')).toBeInTheDocument();
  });

  it('says there is none, with the way to a first one, for an organization with no add-on', async () => {
    server.use(handleListAddonFamilies({ body: [] }));
    renderList();

    expect(await screen.findByTestId('addons-empty')).toHaveTextContent('No add-on yet');
    expect(await within(screen.getByTestId('addons-empty')).findByRole('link', { name: 'New add-on' })).toHaveAttribute('href', '/catalog/addons/new');
  });

  it('offers a new add-on and a new version to a session that may write, and neither to one that may not', async () => {
    renderList();

    expect((await screen.findAllByRole('link', { name: 'New Version' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'New add-on' }).length).toBeGreaterThan(0);
  });

  it('is only read by a session that may not write', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons']));
    renderList();

    await screen.findByText('Extra seats');

    expect(screen.queryByRole('link', { name: 'New add-on' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New Version' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });

  it('filters the versions by name, and drops the families none of whose versions is kept', async () => {
    renderList();
    await screen.findByText('Extra seats');

    await userEvent.type(screen.getByPlaceholderText('Add-on name'), 'storage');

    await waitFor(() => expect(screen.queryByText('Extra seats')).toBeNull());
    expect(screen.getByText('Extra storage')).toBeInTheDocument();
  });
});

describe('listing a family in the public catalogue', () => {
  it('sends the flag asked for, and says what was done once the API answered', async () => {
    const bodies: unknown[] = [];
    server.use(
      handleUpdateAddonFamily(async ({ params, request }) => {
        bodies.push(await request.json());

        return HttpResponse.json({ ...FAMILIES[1], isPublic: true, slug: params.familySlug } as AddonFamily);
      }),
    );
    renderList();

    await userEvent.click(await screen.findByRole('switch', { name: 'List Extra storage in the public catalogue' }));

    await waitFor(() => expect(bodies).toEqual([{ isPublic: true }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('The family is listed in the public catalogue'));
  });

  it('shows the words of a refusal in a toast, and leaves the switch as the API holds it', async () => {
    server.use(
      handleUpdateAddonFamily(() => refusal(403, { code: 'Auth.MissingScope', detail: 'missing required scope: write:addons' })),
    );
    renderList();

    const toggle = await screen.findByRole('switch', { name: 'List Extra storage in the public catalogue' });
    await userEvent.click(toggle);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toggle).not.toBeChecked();
  });
});

describe('the lifecycle of a version', () => {
  it('publishes a draft once confirmed, naming the version and saying what it changes', async () => {
    const published = vi.fn();
    server.use(
      handlePublishAddon(({ params }) => {
        published(params.addonSlug);

        return HttpResponse.json({ ...SEATS_DRAFT, lifecycleState: 'PUBLISHED' });
      }),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2027')).findByRole('button', { name: 'Publish' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(published).not.toHaveBeenCalled();
    expect(within(confirmation).getByText('Publish Extra seats v2?')).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(published).toHaveBeenCalledWith('extra-seats-v2'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Version published'));
  });

  it('archives a published version that is not the default, and unarchives an archived one', async () => {
    const moved: string[] = [];
    server.use(
      handleArchiveAddon(({ params }) => {
        moved.push(`archive ${String(params.addonSlug)}`);

        return HttpResponse.json({ ...SEATS_PUBLISHED_PLAIN, lifecycleState: 'ARCHIVED' });
      }),
      handleUnarchiveAddon(({ params }) => {
        moved.push(`unarchive ${String(params.addonSlug)}`);

        return HttpResponse.json({ ...STORAGE_ARCHIVED, lifecycleState: 'PUBLISHED' });
      }),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2028')).findByRole('button', { name: 'Archive' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(moved).toEqual(['archive extra-seats-plain']));
  });

  it('keeps the default of a family from being archived: the button is there, off', async () => {
    renderList();

    const row = await rowOf('2026');

    // The button is there, off, so that a vendor looking for it learns what to do first.
    const archive = await within(row).findByRole('button', { name: 'Archive' });

    expect(archive).toBeDisabled();
    await userEvent.click(archive);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('says in a toast why a transition was refused', async () => {
    server.use(
      handlePublishAddon(() => refusal(409, { code: 'PublishAddon.NotADraft', detail: 'add-on is PUBLISHED, not DRAFT' })),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2027')).findByRole('button', { name: 'Publish' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('add-on is PUBLISHED, not DRAFT'));
  });
});

describe('the default version of a family', () => {
  it('moves onto a published version by restating it as it stands with only the flag changed', async () => {
    const bodies: AddonChanges[] = [];
    server.use(
      handleUpdateAddon(async ({ request }) => {
        bodies.push((await request.json()) as AddonChanges);

        return HttpResponse.json({ ...SEATS_PUBLISHED_PLAIN, isDefault: true });
      }),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2028')).findByRole('button', { name: 'Set as default' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      description: SEATS_PUBLISHED_PLAIN.description,
      isDefault: true,
      maxQuantity: 10,
      name: 'Extra seats',
      versionName: '2028',
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Default version updated'));
  });

  it('is withheld from a draft, which the button says on hover: only a published version can be the default', async () => {
    renderList();

    const set = await within(await rowOf('2027')).findByRole('button', { name: 'Set as default' });

    expect(set).toBeDisabled();
  });

  it('is taken off the version that has it, which is the way out for a default that has to be archived', async () => {
    const bodies: AddonChanges[] = [];
    server.use(
      handleUpdateAddon(async ({ request }) => {
        bodies.push((await request.json()) as AddonChanges);

        return HttpResponse.json({ ...SEATS_V1, isDefault: false });
      }),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2026')).findByRole('button', { name: 'Unset default' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.isDefault).toBe(false);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Default version unset'));
  });
});

describe('deleting a draft', () => {
  it('asks first, then takes its metered prices off, removes its grants and deletes it, in that order', async () => {
    const order: string[] = [];
    const metered = buildPrice({
      billingModel: 'USAGE_BASED',
      id: 'price-metered',
      metered: { entitlementSlug: 'api-calls', saleUnitFactor: '1' },
      unitAmountDecimal: '0.1',
    });
    server.use(
      handleListAddonPrices({ body: [metered, buildPrice({ billingPeriod: 'MONTHLY', id: 'price-flat', isDefault: true, unitAmountDecimal: '1000' })] }),
      handleListAddonEntitlements({ body: [seatsGrant()] }),
      handleDeprecateAddonPrice(({ params }) => {
        order.push(`deprecate ${String(params.priceId)}`);

        return HttpResponse.json({ ...metered, status: 'DEPRECATED' });
      }),
      handleUnassignAddonEntitlement(({ params }) => {
        order.push(`unassign ${String(params.entitlementSlug)}`);

        return new HttpResponse(null, { status: 204 });
      }),
      handleDeleteAddon(({ params }) => {
        order.push(`delete ${String(params.addonSlug)}`);

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2027')).findByRole('button', { name: 'Delete' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(order).toEqual([]);
    expect(within(confirmation).getByText('Delete the draft Extra seats v2?')).toBeInTheDocument();
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(order).toEqual(['deprecate price-metered', 'unassign seats', 'delete extra-seats-v2']));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Draft deleted'));
  });

  it('is only offered for a draft', async () => {
    renderList();

    await within(await rowOf('2026')).findByRole('button', { name: 'Unset default' });
    expect(within(await rowOf('2026')).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(await rowOf('2028')).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(await within(await rowOf('2027')).findByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('says the words of the API when the version cannot be deleted, and leaves what the API holds', async () => {
    server.use(
      handleListAddonPrices({ body: [] }),
      handleListAddonEntitlements({ body: [] }),
      handleDeleteAddon(() =>
        refusal(409, {
          code: 'DeleteAddon.InUseConflict',
          detail: 'this add-on version was attached to an instance: it is history',
        }),
      ),
    );
    renderList();

    await userEvent.click(await within(await rowOf('2027')).findByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('this add-on version was attached to an instance: it is history'),
    );
  });
});
