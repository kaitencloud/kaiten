import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type {
  License,
  LicenseFamilyUpdate,
  LicenseFamilyView,
} from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleListLicenseFamilies,
  handleUpdateLicenseFamily,
} from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  createLoadedPageClient,
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import {
  licenseFamiliesQueryOptions,
  licensesWithInstancesQueryOptions,
} from '../../queries';
import { LicenseFamilySettingsDialog } from '../family-settings';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

useBillingTexts();

const version = (slug: string, name: string, pricingType: 'FREE' | 'PAID') =>
  ({
    createdAt: '2026-06-11T12:00:00Z',
    familyId: `family-${slug}`,
    id: `license-${slug}`,
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name,
    nbInstances: 0,
    pricingType,
    slug,
    type: pricingType === 'FREE' ? 'COMMUNITY' : 'PAID',
    updatedAt: '2026-06-11T12:00:00Z',
    version: '1',
  }) as License & { nbInstances: number };

const family = (
  slug: string,
  overrides: Partial<LicenseFamilyView> = {},
): LicenseFamilyView =>
  ({
    createdAt: '2026-06-11T12:00:00Z',
    fallbackLicenseFamilySlug: null,
    id: `family-${slug}`,
    isPublic: false,
    slug,
    trialEndWithoutPaymentMethod: 'CANCEL',
    trialReminderDays: 3,
    updatedAt: '2026-06-11T12:00:00Z',
    versionCount: 1,
    ...overrides,
  }) as LicenseFamilyView;

const licenses = [
  version('pro', 'Pro', 'PAID'),
  version('community', 'Community', 'FREE'),
  version('basic', 'Basic', 'FREE'),
];

let families: LicenseFamilyView[];
let updates: Array<{ body: LicenseFamilyUpdate; familySlug: string }>;

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  families = [family('pro'), family('community'), family('basic')];
  updates = [];
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    // What a save refreshes afterwards.
    handleListLicenseFamilies(() =>
      HttpResponse.json({ hasMore: false, items: families }),
    ),
    handleUpdateLicenseFamily(async ({ params, request }) => {
      const body = (await request.json()) as LicenseFamilyUpdate;
      updates.push({ body, familySlug: String(params.familySlug) });

      return HttpResponse.json(families[0]);
    }),
  );
});

const renderDialog = (familySlug = 'pro') => {
  const onClose = vi.fn();
  const client = createLoadedPageClient();
  // The token says nothing of scopes: every action is offered.
  client.setQueryData(grantedScopesQueryKey, null);
  // What the route loads before the dialog is drawn.
  client.setQueryData(licenseFamiliesQueryOptions.queryKey, {
    hasMore: false,
    items: families,
  });
  client.setQueryData(licensesWithInstancesQueryOptions.queryKey, licenses);
  renderWithClient(
    <LicenseFamilySettingsDialog familySlug={familySlug} onClose={onClose} />,
    client,
  );

  return onClose;
};

const reminder = () => screen.findByLabelText(/^Trial reminder/);
const save = () => screen.findByRole('button', { name: 'Save settings' });

describe('the settings of a family of licenses', () => {
  it('opens on what the family has, and names the family', async () => {
    families[0] = family('pro', {
      fallbackLicenseFamilySlug: 'community',
      trialEndWithoutPaymentMethod: 'CONVERT',
      trialReminderDays: 7,
    });
    renderDialog();

    expect(await reminder()).toHaveValue('7');
    expect(
      screen.getByRole('combobox', {
        name: /When a subscription ends, fall back to/,
      }),
    ).toHaveTextContent('Community');
    expect(
      screen.getByRole('combobox', { name: /A trial that ends without/ }),
    ).toHaveTextContent('Convert it to an active subscription');
    expect(
      screen.getByText(/How Pro behaves when a subscription to it ends/),
    ).toBeInTheDocument();
  });

  it('sends the setting that was changed and nothing else, then closes', async () => {
    const onClose = renderDialog();
    const days = await reminder();

    await userEvent.clear(days);
    await userEvent.type(days, '10');
    await userEvent.click(await save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updates).toEqual([
      { body: { trialReminderDays: 10 }, familySlug: 'pro' },
    ]);
    expect(toast.success).toHaveBeenCalledWith('The license settings were saved');
  });

  it('holds a reminder out of range, in the words of the form, and sends nothing', async () => {
    renderDialog();
    const days = await reminder();

    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.tab();

    expect(
      await screen.findByText('Enter a whole number of days from 1 to 30'),
    ).toBeInTheDocument();
    expect(await save()).toBeDisabled();
    expect(updates).toHaveLength(0);
  });

  it('shows the words of the API on the field a refusal names, and keeps what was typed', async () => {
    const onClose = renderDialog();
    server.use(
      handleUpdateLicenseFamily(() =>
        refusal(422, {
          code: 'UpdateLicenseFamily.InvalidTrialReminderDays',
          detail: 'trialReminderDays is between 1 and 30',
        }),
      ),
    );
    const days = await reminder();

    await userEvent.clear(days);
    await userEvent.type(days, '12');
    await userEvent.click(await save());

    expect(
      await screen.findByText('trialReminderDays is between 1 and 30'),
    ).toBeInTheDocument();
    expect(days).toHaveValue('12');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says any other refusal above the buttons', async () => {
    const onClose = renderDialog();
    server.use(
      handleUpdateLicenseFamily(() =>
        refusal(404, {
          code: 'UpdateLicenseFamily.NotFound',
          detail: 'license family "pro" not found',
        }),
      ),
    );
    const days = await reminder();

    await userEvent.clear(days);
    await userEvent.type(days, '12');
    await userEvent.click(await save());

    expect(
      await screen.findByText('license family "pro" not found'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes for a family the lists do not know', async () => {
    const onClose = renderDialog('nothing-here');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is not there where billing is off', async () => {
    server.use(
      handleGetBillingCapabilities({
        body: billingCapabilitiesProfiles.disabled(),
      }),
    );
    renderDialog();

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/^Trial reminder/)).not.toBeInTheDocument();
  });
});
