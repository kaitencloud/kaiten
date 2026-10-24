import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  Addon,
  AddonChanges,
  AddonFamilyVisibility,
  NewAddon,
} from '@/api-client';
import {
  handleCreateAddon,
  handleGetAddon,
  handleGetBillingCapabilities,
  handleUpdateAddon,
  handleUpdateAddonFamily,
} from '@/api-client/msw.gen';
import {
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
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

// How a mid-period increase of a family's add-ons is billed is the family's (§10.1
// rule 7): a new family is created with it, the edit of a version sets it on the
// family, and a new version of a family takes the family's as it is.

beforeEach(() => {
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:addons', 'write:addons']),
  );
  server.use(
    handleGetBillingCapabilities({
      body: billingCapabilitiesProfiles.stackWithAddons(),
    }),
    handleGetAddon(() => HttpResponse.json(SEATS_V1)),
  );
});

const renderDialog = (
  props: Partial<Parameters<typeof AddonFormDialog>[0]> = {},
) => {
  const onSaved = vi.fn();
  renderScreen(
    <AddonFormDialog onClose={vi.fn()} onSaved={onSaved} {...props} />,
  );

  return { onSaved };
};

async function chooseNextBoundary() {
  await userEvent.click(
    await screen.findByRole('combobox', { name: /Mid-period increases/ }),
  );
  await userEvent.click(
    await screen.findByRole('option', {
      name: 'Billed from the next boundary',
    }),
  );
}

describe('how a mid-period increase of the family is billed', () => {
  it('opens a family with a true-up, and with what is chosen, warning that the next boundary leaves an increase unpaid until then', async () => {
    const bodies: NewAddon[] = [];
    server.use(
      handleCreateAddon(async ({ request }) => {
        bodies.push((await request.json()) as NewAddon);

        return HttpResponse.json(SEATS_V1, { status: 201 });
      }),
    );
    renderDialog();

    await userEvent.type(await screen.findByLabelText(/^Name/), 'Extra seats');
    expect(screen.queryByTestId('increase-billing-hint')).toBeNull();
    await chooseNextBoundary();
    expect(screen.getByTestId('increase-billing-hint')).toHaveTextContent(
      'unpaid until the next boundary',
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create add-on' }),
    );

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]?.increaseBilling).toBe('NEXT_BOUNDARY');
  });

  it('is not asked of a new version, which takes its family’s', async () => {
    renderDialog({
      family: {
        currentVersion: SEATS_V1,
        id: 'family',
        increaseBilling: 'TRUE_UP',
        isPublic: false,
        lastVersion: 1,
        slug: 'extra-seats',
        versions: [SEATS_V1],
      },
    });

    expect(await screen.findByLabelText(/^Name/)).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: /Mid-period increases/ }),
    ).toBeNull();
  });

  it('is set on the family from the edit of a version, before the version, and only when it changed', async () => {
    const writes: string[] = [];
    const familyBodies: AddonFamilyVisibility[] = [];
    server.use(
      handleUpdateAddonFamily(async ({ params, request }) => {
        writes.push(`family:${String(params.familySlug)}`);
        familyBodies.push((await request.json()) as AddonFamilyVisibility);

        return HttpResponse.json({
          id: 'family',
          increaseBilling: 'NEXT_BOUNDARY',
          isPublic: false,
          lastVersion: 1,
          slug: 'extra-seats',
          versions: [],
        });
      }),
      handleUpdateAddon(async ({ request }) => {
        writes.push('version');
        (await request.json()) as AddonChanges;

        return HttpResponse.json({
          ...SEATS_V1,
          increaseBilling: 'NEXT_BOUNDARY',
        } as Addon);
      }),
    );
    const { onSaved } = renderDialog({ addon: SEATS_V1 });

    await chooseNextBoundary();
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(writes).toEqual([`family:${SEATS_V1.familySlug}`, 'version']);
    expect(familyBodies).toEqual([{ increaseBilling: 'NEXT_BOUNDARY' }]);
  });

  it('shows a refusal of the setting on its field, and saves no version', async () => {
    const writes: string[] = [];
    server.use(
      handleUpdateAddonFamily(() =>
        refusal(422, {
          code: 'UpdateAddonFamily.InvalidIncreaseBilling',
          detail: 'increaseBilling is TRUE_UP or NEXT_BOUNDARY',
        }),
      ),
      handleUpdateAddon(() => {
        writes.push('version');

        return HttpResponse.json(SEATS_V1);
      }),
    );
    renderDialog({ addon: SEATS_V1 });

    await chooseNextBoundary();
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('increaseBilling is TRUE_UP or NEXT_BOUNDARY'),
    ).toBeInTheDocument();
    expect(writes).toEqual([]);
  });
});
