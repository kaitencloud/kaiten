import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { License } from '@/api-client';
import {
  handleListEntitlements,
  handleGetInstances,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleGetLicenses,
  handleListLicenseFamilies,
  handleUpdateLicense,
} from '@/api-client/msw.gen';
import {
  createTestClient,
  refusal,
  renderWithClient,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { LicenseForm } from '../forms';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const client = vi.hoisted(() => ({ current: undefined as never }));

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: client.current }),
  useRouter: () => ({ navigate: vi.fn() }),
}));

useBillingTexts();

const opened = {
  createdAt: '2026-06-11T12:00:00Z',
  description: 'Standard',
  familyId: 'family-standard',
  id: 'standard',
  isDefault: false,
  lifecycleState: 'PUBLISHED',
  name: 'Standard',
  pricingType: 'PAID',
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
  client.current = createTestClient() as never;
  stored = opened;
  updates = [];
  const empty = { body: { hasMore: false, items: [] } };
  server.use(
    handleGetLicense(() => HttpResponse.json(stored)),
    handleListEntitlements(empty),
    handleGetLicenses(empty),
    handleGetInstances(empty),
    handleListLicenseFamilies(empty),
    handleGetLicenseEntitlements(empty),
    handleUpdateLicense(async ({ request }) => {
      updates.push(await request.json());

      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const renderForm = () => {
  const onSubmitted = vi.fn();
  renderWithClient(
    <Suspense fallback={null}>
      <LicenseForm license={opened} onSubmitted={onSubmitted} />
    </Suspense>,
    client.current,
  );

  return onSubmitted;
};

const save = () =>
  userEvent.click(screen.getByRole('button', { name: 'Update License' }));

describe('the form that edits a license version', () => {
  it('sends what was changed on top of the version as the API holds it now', async () => {
    const onSubmitted = renderForm();
    const description = await screen.findByLabelText(/Description/);

    // Another tab made the version the default and gave it a trial of 30 days.
    stored = { ...stored, isDefault: true, trialPeriodDays: 30 };
    await userEvent.clear(description);
    await userEvent.type(description, 'Standard plan');
    await save();

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(updates).toEqual([
      {
        description: 'Standard plan',
        isDefault: true,
        name: 'Standard',
        pricingType: 'PAID',
        requiresPaymentMethod: false,
        trialPeriodDays: 30,
        type: 'PAID',
        versionName: 'Version - 1',
      },
    ]);
  });

  it('says the version is gone when it was deleted meanwhile, and does not create it again', async () => {
    const onSubmitted = renderForm();
    const description = await screen.findByLabelText(/Description/);
    server.use(
      handleGetLicense(() =>
        refusal(404, {
          code: 'GetLicense.NotFound',
          detail: 'The license does not exist',
        }),
      ),
    );

    await userEvent.type(description, ' plan');
    await save();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The license does not exist'),
    );
    expect(updates).toHaveLength(0);
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
