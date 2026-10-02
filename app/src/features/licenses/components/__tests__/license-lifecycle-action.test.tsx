import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw/http';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import type { License } from '@/api-client';
import {
  handleArchiveLicense,
  handlePublishLicense,
  handleUnarchiveLicense,
} from '@/api-client/msw.gen';
import { TooltipProvider } from '@/components/ui/tooltip';
// For its side effect: the REST client then throws an `ApiError`, the status
// and the problem of a refusal, whose detail is what the action reports.
import '@/lib/api/bootstrap';
import type { LicenseLifecycleTransition } from '../../utils/license-lifecycle.utils';
import { LicenseLifecycleAction } from '../license-lifecycle-action';

const mocks = vi.hoisted(() => ({
  invalidateLicenseLists: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  useRouteContext: () => ({ queryClient: mocks.queryClient }),
}));

vi.mock('../../queries', () => ({
  invalidateLicenseLists: mocks.invalidateLicenseLists,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('react-i18next', () => ({
  // Keys come back verbatim, followed by the version they name when any.
  useTranslation: () => ({
    t: (key: string, values?: { name?: string; version?: string }) =>
      values ? `${key} (${values.name} v${values.version})` : key,
  }),
}));

const makeLicense = (overrides: Partial<License>): License =>
  ({
    description: 'Starter',
    familyId: 'family-starter',
    id: 'starter-v2',
    isDefault: false,
    lifecycleState: 'PUBLISHED',
    name: 'Starter',
    slug: 'starter-v2',
    type: 'PAID',
    version: '2',
    ...overrides,
  }) as License;

const withProviders = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    <TooltipProvider>{children}</TooltipProvider>
  </QueryClientProvider>
);

const renderAction = (license: License) =>
  render(
    withProviders(
      <LicenseLifecycleAction appearance="card" license={license} />,
    ),
  );

type TransitionCall = {
  licenseSlug: string;
  transition: LicenseLifecycleTransition;
};

/**
 * Serves the three transition operations, each answering with the moved
 * version, and records the ones the API received, with the slug each named.
 */
function serveTransitions() {
  const calls: TransitionCall[] = [];
  const moved = (transition: LicenseLifecycleTransition, licenseSlug: string) => {
    calls.push({ licenseSlug, transition });
    return HttpResponse.json(makeLicense({ slug: licenseSlug }));
  };

  server.use(
    handlePublishLicense(({ params }) => moved('publish', params.licenseSlug)),
    handleArchiveLicense(({ params }) => moved('archive', params.licenseSlug)),
    handleUnarchiveLicense(({ params }) =>
      moved('unarchive', params.licenseSlug),
    ),
  );

  return calls;
}

describe('LicenseLifecycleAction', () => {
  let calls: TransitionCall[];

  beforeEach(() => {
    vi.clearAllMocks();
    calls = serveTransitions();
  });

  // Each state accepts one transition, and each transition is its own API
  // operation: an update cannot move the state any more.
  it.each([
    ['DRAFT', 'publish'],
    ['PUBLISHED', 'archive'],
    ['ARCHIVED', 'unarchive'],
  ] as const)(
    'moves a %s version through %s once confirmed',
    async (lifecycleState, transition) => {
      const user = userEvent.setup();
      renderAction(makeLicense({ lifecycleState }));

      await user.click(
        screen.getByRole('button', {
          name: `Pages.Licenses.LifecycleActions.${transition}.label`,
        }),
      );

      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveTextContent(
        `Pages.Licenses.LifecycleActions.${transition}.title (Starter v2)`,
      );
      expect(dialog).toHaveTextContent(
        `Pages.Licenses.LifecycleActions.${transition}.description`,
      );
      expect(calls).toEqual([]);

      await user.click(
        within(dialog).getByRole('button', {
          name: `Pages.Licenses.LifecycleActions.${transition}.confirm`,
        }),
      );

      await waitFor(() =>
        expect(mocks.toastSuccess).toHaveBeenCalledWith(
          `Pages.Licenses.LifecycleActions.${transition}.success`,
        ),
      );
      // One request, to this transition's own operation and none other.
      expect(calls).toEqual([{ licenseSlug: 'starter-v2', transition }]);
      // The moved version is the detail as the API returned it; only the
      // lists are refetched.
      expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
        [expect.objectContaining({ _id: 'getLicense', path: { licenseSlug: 'starter-v2' } })],
        expect.objectContaining({ slug: 'starter-v2' }),
      );
      await waitFor(() =>
        expect(mocks.invalidateLicenseLists).toHaveBeenCalledWith(
          mocks.queryClient,
        ),
      );
    },
  );

  // A refetch while the dialog is open -- someone else published the version
  // meanwhile -- must not turn "publish" into "archive" under the vendor's
  // cursor. The dialog confirms what it was opened for, and the API refuses it
  // if it no longer applies.
  it('confirms the transition it was opened for, even if the version moved meanwhile', async () => {
    const user = userEvent.setup();
    const view = renderAction(makeLicense({ lifecycleState: 'DRAFT' }));

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.publish.label',
      }),
    );
    const dialog = await screen.findByRole('alertdialog');

    view.rerender(
      withProviders(
        <LicenseLifecycleAction
          appearance="card"
          license={makeLicense({ lifecycleState: 'PUBLISHED' })}
        />,
      ),
    );

    expect(dialog).toHaveTextContent(
      'Pages.Licenses.LifecycleActions.publish.title (Starter v2)',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.publish.confirm',
      }),
    );

    await waitFor(() =>
      expect(calls).toEqual([
        { licenseSlug: 'starter-v2', transition: 'publish' },
      ]),
    );
  });

  it('changes nothing when the confirmation is dismissed', async () => {
    const user = userEvent.setup();
    renderAction(makeLicense({ lifecycleState: 'PUBLISHED' }));

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.archive.label',
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Common.cancel',
      }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([]);
    expect(mocks.invalidateLicenseLists).not.toHaveBeenCalled();
  });

  // The API would refuse with ArchiveLicense.DefaultMustBePublished; the
  // console withholds the action and says what to do first.
  it("withholds archiving from the family's default and explains why", async () => {
    const user = userEvent.setup();
    renderAction(makeLicense({ isDefault: true, lifecycleState: 'PUBLISHED' }));

    const button = screen.getByRole('button', {
      name: 'Pages.Licenses.LifecycleActions.archive.label',
    });
    expect(button).toBeDisabled();

    // The disabled button emits no events, so the tooltip listens on its
    // wrapper.
    await user.hover(button.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Pages.Licenses.LifecycleActions.archiveDefaultUnavailable',
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  // A default can only be PUBLISHED, so publishing or unarchiving is never
  // what is withheld.
  it('offers publish on a draft even when it is flagged as the default', () => {
    renderAction(makeLicense({ isDefault: true, lifecycleState: 'DRAFT' }));

    expect(
      screen.getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.publish.label',
      }),
    ).toBeEnabled();
  });

  it("reports the API's reason when it refuses the transition", async () => {
    server.use(
      handleArchiveLicense(({ params }) =>
        HttpResponse.json(
          {
            code: 'ArchiveLicense.NotPublished',
            detail: `License "${params.licenseSlug}" is already archived`,
            status: 409,
            title: 'Conflict',
          },
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAction(makeLicense({ lifecycleState: 'PUBLISHED' }));

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.archive.label',
      }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.archive.confirm',
      }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'License "starter-v2" is already archived',
      ),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // Refetched all the same: a refusal usually means the version moved in
    // the meantime, and the page should show where it stands now.
    await waitFor(() =>
      expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: [
          expect.objectContaining({
            _id: 'getLicense',
            path: { licenseSlug: 'starter-v2' },
          }),
        ],
      }),
    );
    await waitFor(() =>
      expect(mocks.invalidateLicenseLists).toHaveBeenCalledWith(
        mocks.queryClient,
      ),
    );
    expect(mocks.queryClient.setQueryData).not.toHaveBeenCalled();
  });

  // In the versions table the row opens the version when clicked; the
  // action must not do that as well.
  it('keeps its click from reaching the table row', async () => {
    const user = userEvent.setup();
    const rowClick = vi.fn();
    render(
      withProviders(
        <div onClick={rowClick} role="presentation">
          <LicenseLifecycleAction
            appearance="row"
            license={makeLicense({ lifecycleState: 'DRAFT' })}
          />
        </div>,
      ),
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Licenses.LifecycleActions.publish.label',
      }),
    );

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(rowClick).not.toHaveBeenCalled();
  });
});
