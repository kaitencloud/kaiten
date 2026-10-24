import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { License } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleGetInstances,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListLicenseFamilies,
  handleUpdateLicense,
} from '@/api-client/msw.gen';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import {
  createTestClient,
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { LicenseCommercialDialog } from '../commercial';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

useBillingTexts();

const opened: License = {
  createdAt: '2026-06-11T12:00:00Z',
  description: 'Standard',
  familyId: 'family-standard',
  id: 'standard',
  isDefault: true,
  lifecycleState: 'PUBLISHED',
  name: 'Standard',
  pricingType: 'PAID',
  requiresPaymentMethod: false,
  slug: 'standard',
  trialPeriodDays: 14,
  type: 'PAID',
  updatedAt: '2026-06-11T12:00:00Z',
  version: '1',
  versionName: 'Version - 1',
} as License;

let stored: License;
let updates: unknown[];

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  stored = opened;
  updates = [];
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
    handleGetLicense(() => HttpResponse.json(stored)),
    // What a save refreshes afterwards.
    handleGetLicenses({ body: { hasMore: false, items: [] } }),
    handleGetInstances({ body: { hasMore: false, items: [] } }),
    handleListLicenseFamilies({ body: { hasMore: false, items: [] } }),
    handleGetLicenseEntitlements({ body: { hasMore: false, items: [] } }),
    handleUpdateLicense(async ({ request }) => {
      updates.push(await request.json());

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const renderDialog = () => {
  const onClose = vi.fn();
  const client = createTestClient();
  // The token says nothing of scopes: every action is offered.
  client.setQueryData(grantedScopesQueryKey, null);
  renderWithClient(
    <LicenseCommercialDialog license={opened} onClose={onClose} />,
    client,
  );

  return onClose;
};

const trial = () => screen.findByLabelText('Trial length (days)');
const save = () => screen.findByRole('button', { name: 'Save' });

describe('the commercial terms of a version', () => {
  it('saves the terms that were changed and leaves the default where another tab put it', async () => {
    const onClose = renderDialog();
    const days = await trial();

    // Another tab made another version the default and renamed this one, after
    // the dialog opened.
    stored = { ...stored, isDefault: false, name: 'Standard (renamed)' };
    await userEvent.clear(days);
    await userEvent.type(days, '7');
    await userEvent.click(await save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updates).toEqual([
      {
        description: 'Standard',
        isDefault: false,
        name: 'Standard (renamed)',
        pricingType: 'PAID',
        requiresPaymentMethod: false,
        trialPeriodDays: 7,
        type: 'PAID',
        versionName: 'Version - 1',
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith('Commercial terms updated');
  });

  it('keeps the terms another tab saved for the fields this one did not touch', async () => {
    const onClose = renderDialog();
    const days = await trial();

    stored = {
      ...stored,
      selfServeCtaUrl: 'https://acme.test/contact',
      trialPeriodDays: 30,
    };
    await userEvent.click(await screen.findByRole('checkbox'));
    await userEvent.click(await save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(days).toHaveValue('14');
    expect(updates).toEqual([
      expect.objectContaining({
        requiresPaymentMethod: true,
        selfServeCtaUrl: 'https://acme.test/contact',
        trialPeriodDays: 30,
      }),
    ]);
  });

  it('says the version is gone when it was deleted meanwhile, and writes nothing', async () => {
    const onClose = renderDialog();
    const days = await trial();
    server.use(
      handleGetLicense(() =>
        refusal(404, {
          code: 'GetLicense.NotFound',
          detail: 'The license does not exist',
        }),
      ),
    );

    await userEvent.clear(days);
    await userEvent.type(days, '7');
    await userEvent.click(await save());

    expect(
      await screen.findByText('The license does not exist'),
    ).toBeInTheDocument();
    expect(updates).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
