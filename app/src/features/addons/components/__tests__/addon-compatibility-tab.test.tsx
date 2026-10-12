import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleGetBillingCapabilities,
  handleListAddonCompatibility,
  handleListLicenseFamilies,
  handleRemoveAddonCompatibility,
  handleSetAddonCompatibility,
} from '@/api-client/msw.gen';
import {
  pageOf,
  refusal,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import { AddonCompatibilityTab } from '../compatibility';
import { licenseFamily, renderScreen } from './addon-test-support';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async () =>
  (await import('./addon-test-support')).createAddonRouterModule(vi.fn()),
);

useBillingTexts();

const FAMILIES = ['starter', 'business', 'enterprise'].map((slug) => licenseFamily(slug));

beforeEach(() => {
  toast.error.mockReset();
  getAuthToken.mockResolvedValue(
    sessionToken(['read:billing', 'read:addons', 'write:addons']),
  );
  server.use(
    handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stackWithAddons() }),
    handleListLicenseFamilies({ body: pageOf(FAMILIES) }),
    handleListAddonCompatibility({ body: { familySlugs: ['starter', 'business'] } }),
  );
});

const renderTab = () => renderScreen(<AddonCompatibilityTab addonSlug="extra-seats-v2" />);
const box = (name: RegExp) => screen.findByRole('checkbox', { name });

describe('the license families a version fits', () => {
  it('are ticked as the API holds them, one box each', async () => {
    renderTab();

    expect(await box(/starter/)).toBeChecked();
    expect(await box(/business/)).toBeChecked();
    expect(await box(/enterprise/)).not.toBeChecked();
    expect(screen.queryByTestId('compatibility-empty')).toBeNull();
  });

  it('declare a family with one request, and take it back with another, each showing what the API holds', async () => {
    let fits = ['starter', 'business'];
    const requests: string[] = [];
    server.use(
      handleListAddonCompatibility(() => HttpResponse.json({ familySlugs: fits })),
      handleSetAddonCompatibility(({ params }) => {
        requests.push(`PUT ${String(params.familySlug)}`);
        fits = [...fits, String(params.familySlug)];

        return new HttpResponse(null, { status: 204 });
      }),
      handleRemoveAddonCompatibility(({ params }) => {
        requests.push(`DELETE ${String(params.familySlug)}`);
        fits = fits.filter((slug) => slug !== params.familySlug);

        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTab();

    await userEvent.click(await box(/enterprise/));
    await waitFor(async () => expect(await box(/enterprise/)).toBeChecked());
    await userEvent.click(await box(/starter/));
    await waitFor(async () => expect(await box(/starter/)).not.toBeChecked());

    expect(requests).toEqual(['PUT enterprise', 'DELETE starter']);
  });

  it('say, when none is ticked, that the version is attachable to nothing', async () => {
    server.use(handleListAddonCompatibility({ body: { familySlugs: [] } }));
    renderTab();

    expect(await screen.findByTestId('compatibility-empty')).toHaveTextContent('Attachable to nothing');
  });

  it('say so when there is no license family yet', async () => {
    server.use(handleListLicenseFamilies({ body: pageOf([]) }));
    renderTab();

    expect(await screen.findByText('There is no license family yet.')).toBeInTheDocument();
  });

  it('show the words of a refusal in a toast, and the box shows what the API holds, not what was clicked', async () => {
    server.use(
      handleSetAddonCompatibility(() =>
        refusal(404, { code: 'SetAddonCompatibility.FamilyNotFound', detail: 'license family "enterprise" not found' }),
      ),
    );
    renderTab();

    await userEvent.click(await box(/enterprise/));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('license family "enterprise" not found'));
    expect(await box(/enterprise/)).not.toBeChecked();
  });

  it('are only read by a session that may not write them', async () => {
    getAuthToken.mockResolvedValue(sessionToken(['read:billing', 'read:addons']));
    renderTab();

    const starter = await box(/starter/);
    await waitFor(() => expect(starter).toBeDisabled());

    expect(within(screen.getByRole('list', { name: 'License families' })).getAllByRole('checkbox')).toHaveLength(3);
  });
});
