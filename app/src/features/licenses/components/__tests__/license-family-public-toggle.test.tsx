import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { LicenseFamilyView, LicenseFamilyVisibility } from '@/api-client';
import {
  handleGetBillingCapabilities,
  handleUpdateLicenseFamily,
} from '@/api-client/msw.gen';
import {
  refusal,
  renderWithClient,
  sessionToken,
  useBillingTexts,
} from '@/test-fixtures/billing-test-support';
import {
  billingCapabilities,
  billingCapabilitiesProfiles,
} from '../../../../../e2e/app/_support/model/billing-capabilities';
import { LicenseFamilyPublicToggle } from '../license-family-public-toggle';

const getAuthToken = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('@/lib/auth-token', () => ({ getAuthToken }));
vi.mock('sonner', () => ({ toast }));

useBillingTexts();

const group = (overrides: Partial<Parameters<typeof LicenseFamilyPublicToggle>[0]['group']> = {}) => ({
  familySlug: 'pro',
  isPublic: false,
  licenseName: 'Pro',
  ...overrides,
});

const family = (isPublic: boolean): LicenseFamilyView =>
  ({
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'family-pro',
    isPublic,
    slug: 'pro',
    updatedAt: '2026-01-01T00:00:00.000Z',
    versionCount: 2,
  }) as LicenseFamilyView;

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
  getAuthToken.mockResolvedValue(sessionToken(['read:licenses', 'write:licenses']));
  server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }));
});

const toggle = () => screen.findByRole('switch', { name: 'List Pro in the public catalogue' });

/** Records the visibility each change of the listing asks for. */
function serveVisibility(answer?: (body: LicenseFamilyVisibility) => Response) {
  const calls: Array<{ body: LicenseFamilyVisibility; familySlug: string }> = [];
  server.use(
    handleUpdateLicenseFamily(async ({ params, request }) => {
      const body = (await request.json()) as LicenseFamilyVisibility;
      calls.push({ body, familySlug: String(params.familySlug) });

      return answer?.(body) ?? HttpResponse.json(family(body.isPublic));
    }),
  );

  return calls;
}

describe('the public listing switch of a family', () => {
  it('shows a family that is private as off, and one that is listed as on', async () => {
    const { unmount } = renderWithClient(<LicenseFamilyPublicToggle group={group()} />);
    expect(await toggle()).not.toBeChecked();
    unmount();

    renderWithClient(<LicenseFamilyPublicToggle group={group({ isPublic: true })} />);
    expect(await toggle()).toBeChecked();
    expect(screen.getByText('Public catalogue')).toBeInTheDocument();
  });

  it('lists the family by its slug, with only the flag, and says so', async () => {
    const calls = serveVisibility();
    renderWithClient(<LicenseFamilyPublicToggle group={group()} />);

    await userEvent.click(await toggle());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('The family is listed in the public catalogue'));
    expect(calls).toEqual([{ body: { isPublic: true }, familySlug: 'pro' }]);
  });

  it('takes it out of the catalogue the same way', async () => {
    const calls = serveVisibility();
    renderWithClient(<LicenseFamilyPublicToggle group={group({ isPublic: true })} />);

    await userEvent.click(await toggle());

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('The family is no longer listed in the public catalogue'),
    );
    expect(calls).toEqual([{ body: { isPublic: false }, familySlug: 'pro' }]);
  });

  it('shows what the API answered: a refusal says why in a toast and the switch stays where it was', async () => {
    serveVisibility(() =>
      refusal(403, { code: 'Auth.MissingScope', detail: 'missing required scope: write:licenses' }),
    );
    renderWithClient(<LicenseFamilyPublicToggle group={group()} />);

    await userEvent.click(await toggle());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('missing required scope: write:licenses'),
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(await toggle()).not.toBeChecked();
  });

  it('is off while a change is on its way, so that it cannot be sent twice', async () => {
    let release: (() => void) | undefined;
    let calls = 0;
    server.use(
      handleUpdateLicenseFamily(async () => {
        calls += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });

        return HttpResponse.json(family(true));
      }),
    );
    renderWithClient(<LicenseFamilyPublicToggle group={group()} />);
    const control = await toggle();

    await userEvent.click(control);
    await waitFor(() => expect(control).toHaveAttribute('data-disabled'));
    await userEvent.click(control);
    await vi.waitFor(() => expect(release).toBeDefined());
    release?.();

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls).toBe(1);
  });

  describe('where it is not offered', () => {
    it('is not there where billing is off: the listing is a billing matter', async () => {
      server.use(handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.disabled() }));
      renderWithClient(<LicenseFamilyPublicToggle group={group()} />);

      await waitFor(() => expect(screen.queryByRole('switch')).toBeNull());
      // The capabilities are read before anything is decided.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('switch')).toBeNull();
    });

    it('is not there for a session that may not write licenses', async () => {
      getAuthToken.mockResolvedValue(sessionToken(['read:licenses', 'read:billing']));
      renderWithClient(<LicenseFamilyPublicToggle group={group()} />);

      await waitFor(() => expect(screen.queryByRole('switch')).toBeNull());
    });

    it('is not there for a family the API did not list: it has no slug to address', async () => {
      renderWithClient(<LicenseFamilyPublicToggle group={group({ familySlug: undefined })} />);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('switch')).toBeNull();
    });

    it('is not there where the API does not know billing at all', async () => {
      server.use(handleGetBillingCapabilities({ body: billingCapabilities({ enabled: false }) }));
      renderWithClient(<LicenseFamilyPublicToggle group={group()} />);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole('switch')).toBeNull();
    });
  });
});
