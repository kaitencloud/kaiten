import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { Addon, AddonChanges, InstanceAddon, NewAddon } from '@/api-client';
import {
  handleCreateAddon,
  handleGetBillingCapabilities,
  handleGetInstances,
  handleListInstanceAddons,
  handleUpdateAddon,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { buildInstanceAddon } from '../../../../../e2e/app/_support/fixtures';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { AddonFormDialog } from '../form';
import { renderScreen, SEATS_V1 } from './addon-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./addon-test-support')).createAddonRouterModule(vi.fn()),
);

useBillingTexts();

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:addons', 'write:addons', 'read:instances']),
  );
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
  );
});

const renderDialog = (props: Partial<Parameters<typeof AddonFormDialog>[0]> = {}) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  renderScreen(<AddonFormDialog onClose={onClose} onSaved={onSaved} {...props} />);

  return { onClose, onSaved };
};

/** Records what the API is asked to create. */
function serveCreate(answer?: (body: NewAddon) => Response) {
  const bodies: NewAddon[] = [];
  server.use(
    handleCreateAddon(async ({ request }) => {
      const body = (await request.json()) as NewAddon;
      bodies.push(body);

      return (
        answer?.(body) ??
        HttpResponse.json({ ...SEATS_V1, name: body.name, slug: 'created' } as Addon, { status: 201 })
      );
    }),
  );

  return bodies;
}

const nameField = () => screen.findByLabelText(/^Name/);
const create = () => screen.findByRole('button', { name: 'Create add-on' });

describe('creating a family of add-ons', () => {
  it('says the first version is a draft, and asks for a name before anything else', async () => {
    renderDialog();

    expect(await screen.findByRole('dialog', { name: 'New add-on' })).toBeInTheDocument();
    expect(await nameField()).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Create as a draft/ })).toBeChecked();
  });

  it('sends the name and how it is sold, as a draft, leaving the slug and the version to the API', async () => {
    const bodies = serveCreate();
    const { onSaved } = renderDialog();

    await userEvent.type(await nameField(), 'Extra seats');
    await userEvent.type(screen.getByLabelText(/Description/), 'Five more named users a unit');
    await userEvent.click(await create());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      description: 'Five more named users a unit',
      familySlug: undefined,
      lifecycleState: 'DRAFT',
      maxQuantity: undefined,
      name: 'Extra seats',
      pricingType: 'PAID',
      slug: undefined,
      versionName: undefined,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ slug: 'created' })));
    expect(toast.success).toHaveBeenCalledWith('Add-on created');
  });

  it('sends the slug, the version name and the maximum that were typed, and publishes at once when asked', async () => {
    const bodies = serveCreate();
    renderDialog();

    await userEvent.type(await nameField(), 'Extra seats');
    await userEvent.type(screen.getByLabelText(/Slug/), 'seats');
    await userEvent.type(screen.getByLabelText(/Version name/), '2026');
    await userEvent.type(screen.getByLabelText(/Maximum quantity/), '10');
    await userEvent.click(screen.getByRole('checkbox', { name: /Create as a draft/ }));
    await userEvent.click(await create());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      lifecycleState: 'PUBLISHED',
      maxQuantity: 10,
      slug: 'seats',
      versionName: '2026',
    });
  });

  it('shows the refusal of the slug on its field, with the words of the API, and keeps what was typed', async () => {
    serveCreate(() =>
      refusal(409, {
        code: 'CreateAddon.SlugConflict',
        detail: 'an add-on family with slug "seats" already exists',
      }),
    );
    const { onSaved } = renderDialog();
    await userEvent.type(await nameField(), 'Extra seats');
    await userEvent.type(screen.getByLabelText(/Slug/), 'seats');

    await userEvent.click(await create());

    expect(await screen.findByText('an add-on family with slug "seats" already exists')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(await nameField()).toHaveValue('Extra seats');
  });

  it('shows a refusal that is about no field above the buttons', async () => {
    serveCreate(() => refusal(503, { detail: 'the add-ons are unavailable' }));
    renderDialog();
    await userEvent.type(await nameField(), 'Extra seats');

    await userEvent.click(await create());

    expect(await screen.findByRole('alert')).toHaveTextContent('the add-ons are unavailable');
  });

  it('refuses an empty name in words before it asks the API', async () => {
    const bodies = serveCreate();
    renderDialog();

    await userEvent.click(await create());

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });
});

describe('creating the next version of a family', () => {
  const family = {
    currentVersion: SEATS_V1,
    id: 'addon-family-extra-seats',
    isPublic: false,
    lastVersion: 1,
    slug: 'extra-seats',
    versions: [SEATS_V1],
  };

  it('starts from nothing but the name and how it is sold, and says the API copies no grant, price or license', async () => {
    const bodies = serveCreate();
    renderDialog({ family });

    expect(await screen.findByRole('dialog', { name: 'New version of Extra seats' })).toBeInTheDocument();
    expect(await nameField()).toHaveValue('Extra seats');
    expect(screen.queryByLabelText(/Slug/)).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Create add-on' }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ familySlug: 'extra-seats', name: 'Extra seats', pricingType: 'PAID' });
    expect(bodies[0]?.slug).toBeUndefined();
  });
});

describe('editing a version', () => {
  const held = (instanceSlug: string, quantity: number): InstanceAddon =>
    buildInstanceAddon({ addon: SEATS_V1, id: `attachment-${instanceSlug}`, quantity });

  /** Two instances hold the version: Acme with eight units, Globex with three. */
  const serveHolders = () =>
    server.use(
      handleGetInstances({
        body: pageOf([
          { id: 'ins-acme', name: 'Acme Production', slug: 'acme-production' },
          { id: 'ins-globex', name: 'Globex Production', slug: 'globex-production' },
        ] as never),
      }),
      handleListInstanceAddons(({ params }) =>
        HttpResponse.json(
          params.instanceSlug === 'acme-production'
            ? [held('acme-production', 8)]
            : [held('globex-production', 3)],
        ),
      ),
    );

  const edit = () => screen.findByRole('button', { name: 'Save' });

  it('keeps how it is sold, and replaces what the API replaces: the name, the description, the version and the most', async () => {
    const bodies: AddonChanges[] = [];
    serveHolders();
    server.use(
      handleUpdateAddon(async ({ request }) => {
        bodies.push((await request.json()) as AddonChanges);

        return HttpResponse.json(SEATS_V1);
      }),
    );
    const { onSaved } = renderDialog({ addon: SEATS_V1 });

    expect(screen.queryByLabelText(/Pricing/)).toBeNull();
    const description = await screen.findByLabelText(/Description/);
    await userEvent.type(description, ' and more');
    await userEvent.click(await edit());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      description: ' and more',
      isDefault: true,
      maxQuantity: 10,
      name: 'Extra seats',
      versionName: '2026',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('stops a lower maximum on its field, naming the instance that holds more than it allows, since the API checks nothing', async () => {
    const updated = vi.fn();
    serveHolders();
    server.use(handleUpdateAddon(() => {
      updated();

      return HttpResponse.json(SEATS_V1);
    }));
    const { onSaved } = renderDialog({ addon: SEATS_V1 });
    const max = await screen.findByLabelText(/Maximum quantity/);

    await userEvent.clear(max);
    await userEvent.type(max, '5');
    await userEvent.click(await edit());

    expect(await screen.findByText(/Acme Production holds 8 units/)).toBeInTheDocument();
    expect(updated).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('lets a lower maximum through when no instance holds more than it allows', async () => {
    const bodies: AddonChanges[] = [];
    serveHolders();
    server.use(
      handleUpdateAddon(async ({ request }) => {
        bodies.push((await request.json()) as AddonChanges);

        return HttpResponse.json(SEATS_V1);
      }),
    );
    renderDialog({ addon: SEATS_V1 });
    const max = await screen.findByLabelText(/Maximum quantity/);

    await userEvent.clear(max);
    await userEvent.type(max, '8');
    await userEvent.click(await edit());

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.maxQuantity).toBe(8);
  });

  it('does not look at who holds the version to raise the maximum, or to remove it', async () => {
    const asked = vi.fn();
    server.use(
      handleGetInstances(() => {
        asked();

        return HttpResponse.json(pageOf([]));
      }),
      handleUpdateAddon(() => HttpResponse.json(SEATS_V1)),
    );
    const { onSaved } = renderDialog({ addon: SEATS_V1 });
    const max = await screen.findByLabelText(/Maximum quantity/);

    await userEvent.clear(max);
    await userEvent.type(max, '20');
    await userEvent.click(await edit());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());

    expect(asked).not.toHaveBeenCalled();
  });

  it('does not change the version when the holders cannot be read: it is not checked, so it is not made', async () => {
    const updated = vi.fn();
    server.use(
      handleGetInstances(() => refusal(503, { detail: 'the instances are unavailable' })),
      handleUpdateAddon(() => {
        updated();

        return HttpResponse.json(SEATS_V1);
      }),
    );
    renderDialog({ addon: SEATS_V1 });
    const max = await screen.findByLabelText(/Maximum quantity/);

    await userEvent.clear(max);
    await userEvent.type(max, '5');
    await userEvent.click(await edit());

    expect(await screen.findByRole('alert')).toHaveTextContent('the instances are unavailable');
    expect(updated).not.toHaveBeenCalled();
  });

  it('is not opened for a session that may not write add-ons', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons']));
    renderDialog({ addon: SEATS_V1 });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
