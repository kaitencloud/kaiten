import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import {
  handleDeleteLicense,
  handleGetLicense,
  handleGetLicenseEntitlements,
  handleUpdateLicense,
} from '@/api-client/msw.gen';
import { TooltipProvider } from '@/components/ui/tooltip';
// For its side effect: the REST client then throws an `ApiError`, which carries the
// words of the API's refusal.
import '@/lib/api/bootstrap';
import type { LicenseWithInstances } from '../../types';
import { LicenseVersionsTableActions } from '../license-versions-table-actions';

let queryClient: QueryClient;
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient }),
}));

// Covered by its own test: here it only has to be there.
vi.mock('../license-lifecycle-action', () => ({
  LicenseLifecycleAction: ({
    license,
  }: {
    license: Pick<LicenseWithInstances, 'lifecycleState'>;
  }) => <span>lifecycle action for {license.lifecycleState}</span>,
}));

vi.mock('react-i18next', () => ({
  // Keys come back verbatim: the copy is not what these tests are about.
  useTranslation: () => ({ t: (key: string) => key }),
}));

const makeLicense = (
  overrides: Partial<LicenseWithInstances>,
): LicenseWithInstances =>
  ({
    description: 'Community',
    familyId: 'family-community',
    id: 'community-v2',
    isDefault: false,
    lifecycleState: 'PUBLISHED',
    name: 'Community',
    nbInstances: 0,
    slug: 'community-v2',
    type: 'DEVELOPMENT',
    version: '2',
    versionName: 'GA',
    ...overrides,
  }) as LicenseWithInstances;

// The version as the API holds it: an update reads it again before it writes.
let stored: LicenseWithInstances;

type ApiCall =
  | { op: 'delete'; licenseSlug: string }
  | { op: 'update'; licenseSlug: string; body: unknown };

/**
 * Serves the writes the row's actions send, and records them with the slug
 * and the body each one carried. A draft to delete grants nothing, so its
 * deletion is the one write it takes.
 */
function serveLicenseWrites() {
  const calls: ApiCall[] = [];

  server.use(
    handleGetLicense(() => HttpResponse.json(stored)),
    handleUpdateLicense(async ({ params, request }) => {
      calls.push({
        op: 'update',
        licenseSlug: params.licenseSlug,
        body: await request.json(),
      });
      return new HttpResponse(null, { status: 204 });
    }),
    handleGetLicenseEntitlements({ body: { hasMore: false, items: [] } }),
    handleDeleteLicense(({ params }) => {
      calls.push({ op: 'delete', licenseSlug: params.licenseSlug });
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return calls;
}

const renderActions = (license: LicenseWithInstances) => {
  stored = license;

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LicenseVersionsTableActions license={license} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

describe('LicenseVersionsTableActions', () => {
  let calls: ApiCall[];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    // The token says nothing of scopes: every action is offered.
    queryClient.setQueryData(grantedScopesQueryKey, null);
    toast.error.mockReset();
    calls = serveLicenseWrites();
  });

  // The default column already marks the default. What is left to do with it
  // is its lifecycle action, and unsetting it: a default cannot be archived,
  // and a family's only published version has no other version to hand the
  // flag to.
  it('offers unsetting the default on the default itself', async () => {
    const user = userEvent.setup();
    renderActions(makeLicense({ isDefault: true }));

    expect(
      screen.getByText('lifecycle action for PUBLISHED'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Pages.Licenses.VersionsTable.setAsDefault',
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Pages.Licenses.DefaultActions.unset' }),
    );

    await waitFor(() => {
      expect(calls).toEqual([
        {
          op: 'update',
          licenseSlug: 'community-v2',
          body: expect.objectContaining({ isDefault: false }),
        },
      ]);
    });
  });

  // The row opens its version when clicked; the table leaves alone any click
  // that lands in an area marked as the row's actions, including one on a
  // disabled control's wrapper.
  it('marks its whole area as the row actions', () => {
    const { container } = renderActions(makeLicense({ lifecycleState: 'DRAFT' }));

    const area = container.querySelector('[data-row-actions]');
    expect(area).not.toBeNull();
    for (const button of screen.getAllByRole('button')) {
      expect(area).toContainElement(button);
    }
  });

  // A draft was never on sale: it is deleted rather than archived.
  it('offers deleting a draft, after a confirmation', async () => {
    const user = userEvent.setup();
    renderActions(makeLicense({ lifecycleState: 'DRAFT' }));

    await user.click(
      screen.getByRole('button', { name: 'Pages.Licenses.DeleteDraft.label' }),
    );
    expect(calls).toEqual([]);

    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Pages.Licenses.DeleteDraft.confirm',
      }),
    );

    await waitFor(() => {
      expect(calls).toEqual([{ op: 'delete', licenseSlug: 'community-v2' }]);
    });
  });

  it.each(['PUBLISHED', 'ARCHIVED'] as const)(
    'offers no deletion on a %s version',
    (lifecycleState) => {
      renderActions(makeLicense({ lifecycleState }));

      expect(
        screen.queryByRole('button', {
          name: 'Pages.Licenses.DeleteDraft.label',
        }),
      ).not.toBeInTheDocument();
    },
  );

  it.each(['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const)(
    'offers the lifecycle action on a %s version',
    (lifecycleState) => {
      renderActions(makeLicense({ lifecycleState }));

      expect(
        screen.getByText(`lifecycle action for ${lifecycleState}`),
      ).toBeInTheDocument();
    },
  );

  it('sets a published version as the default', async () => {
    const user = userEvent.setup();
    renderActions(makeLicense({}));

    const button = screen.getByRole('button', {
      name: 'Pages.Licenses.VersionsTable.setAsDefault',
    });
    expect(button).toBeEnabled();

    await user.click(button);

    await waitFor(() => {
      expect(calls).toEqual([
        {
          op: 'update',
          licenseSlug: 'community-v2',
          body: expect.objectContaining({ isDefault: true }),
        },
      ]);
    });
    // The version is assigned by the API and never changes: leaving it out is
    // how the update changes nothing about it.
    expect(calls[0]).not.toHaveProperty('body.version');
  });

  // The API would refuse with UpdateLicense.DefaultMustBePublished; the
  // console withholds the action and says why, rather than letting the
  // request fail.
  it.each(['DRAFT', 'ARCHIVED'] as const)(
    'withholds the action from a %s version and explains why',
    async (lifecycleState) => {
      const user = userEvent.setup();
      renderActions(makeLicense({ lifecycleState }));

      const button = screen.getByRole('button', {
        name: 'Pages.Licenses.VersionsTable.setAsDefault',
      });
      expect(button).toBeDisabled();

      // The disabled button emits no events, so the tooltip listens on its
      // wrapper -- hovering the button reaches it all the same.
      await user.hover(button.parentElement as HTMLElement);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Pages.Licenses.VersionsTable.setDefaultUnavailable',
      );
      expect(calls).toEqual([]);
    },
  );

  // The page was loaded before another tab edited the version: moving the default
  // must not take that edit back.
  it('moves the default without taking back what changed on the version meanwhile', async () => {
    const user = userEvent.setup();
    renderActions(makeLicense({}));
    stored = makeLicense({
      description: 'Edited in another tab',
      name: 'Community (renamed)',
      pricingType: 'PAID',
      trialPeriodDays: 14,
      versionName: 'GA 2',
    });

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Licenses.VersionsTable.setAsDefault',
      }),
    );

    await waitFor(() => {
      expect(calls).toEqual([
        {
          op: 'update',
          licenseSlug: 'community-v2',
          body: {
            description: 'Edited in another tab',
            isDefault: true,
            name: 'Community (renamed)',
            pricingType: 'PAID',
            requiresPaymentMethod: false,
            trialPeriodDays: 14,
            type: 'DEVELOPMENT',
            versionName: 'GA 2',
          },
        },
      ]);
    });
  });

  // The default was moved to another version meanwhile: unsetting it here is
  // sent as asked, since it is what the person chose, and nothing else changes.
  it('does not set the default again on a version whose default moved away', async () => {
    const user = userEvent.setup();
    renderActions(makeLicense({ isDefault: true }));
    stored = makeLicense({ isDefault: false, name: 'Community (renamed)' });

    await user.click(
      screen.getByRole('button', { name: 'Pages.Licenses.DefaultActions.unset' }),
    );

    await waitFor(() => {
      expect(calls).toEqual([
        {
          op: 'update',
          licenseSlug: 'community-v2',
          body: expect.objectContaining({
            isDefault: false,
            name: 'Community (renamed)',
          }),
        },
      ]);
    });
  });

  it('writes nothing when the version was deleted meanwhile', async () => {
    const user = userEvent.setup();
    renderActions(makeLicense({}));
    server.use(
      handleGetLicense(() =>
        HttpResponse.json(
          { code: 'GetLicense.NotFound', detail: 'The license does not exist', status: 404 },
          { status: 404 },
        ),
      ),
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Licenses.VersionsTable.setAsDefault',
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('The license does not exist'),
    );
    expect(calls).toEqual([]);
  });
});
