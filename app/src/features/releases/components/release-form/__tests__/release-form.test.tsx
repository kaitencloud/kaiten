import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReleaseForm } from '../index';

function renderForm() {
  return render(
    <TooltipProvider>
      <ReleaseForm />
    </TooltipProvider>,
  );
}

const { navigateMock, useNavigateMock, useSuspenseQueryMock } = vi.hoisted(
  () => ({
    navigateMock: vi.fn(),
    useNavigateMock: vi.fn(() => navigateMock),
    useSuspenseQueryMock: vi.fn(),
  }),
);

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useMutation: vi.fn(() => ({
      isPending: false,
      mutateAsync: vi.fn(),
    })),
    useSuspenseQuery: useSuspenseQueryMock,
  };
});

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: useNavigateMock,
  useRouteContext: () => ({
    queryClient: { invalidateQueries: vi.fn() },
  }),
}));

vi.mock('react-i18next', () => ({
  initReactI18next: { init: () => undefined, type: '3rdParty' },
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string, opts?: unknown) => {
      if (typeof opts === 'string') return opts;
      const translations: Record<string, string> = {
        'Common.cancel': 'Cancel',
        'Common.continue': 'Continue',
        'Common.noResults': 'No results',
        'Features.Releases.Form.createRelease': 'Create Release',
        'Features.Releases.Form.description': 'Description',
        'Features.Releases.Form.descriptionPlaceholder':
          'Describe this release...',
        'Features.Releases.Form.SubmitBlockers.creationModeRequired':
          'Choose how to create the release.',
        'Features.Releases.Form.SubmitBlockers.stepTitle':
          'Complete this step before continuing:',
        'Features.Releases.Form.SubmitBlockers.title':
          'You still need to fix the following before submitting:',
        'Features.Releases.Form.version': 'Version',
        'Pages.Releases.Deployments.Form.Buttons.back': 'Back',
        'Pages.Releases.Deployments.Form.Buttons.next': 'Next',
        'Pages.Releases.Deployments.Form.Columns.actions': 'Actions',
        'Pages.Releases.Deployments.Form.Columns.name': 'Name',
        'Pages.Releases.Deployments.Form.Columns.source': 'Source',
        'Pages.Releases.Deployments.Form.Columns.version': 'Version',
        'Pages.Releases.Deployments.Form.Steps.base': 'Release base',
        'Pages.Releases.Deployments.Form.Steps.components': 'Components',
        'Pages.Releases.Deployments.Form.Steps.metadata': 'Information',
        'Pages.Releases.Deployments.Form.basedOn': `Based on ${(opts as { version?: string })?.version ?? ''}`,
        'Pages.Releases.Deployments.Form.changeBaseDialog.confirm':
          'Change base',
        'Pages.Releases.Deployments.Form.changeBaseDialog.description':
          'Changing the release base will remove the current component selections, edits, and new components. Release metadata will be kept.',
        'Pages.Releases.Deployments.Form.changeBaseDialog.title':
          'Change release base?',
        'Pages.Releases.Deployments.Form.componentsCard.addFromCatalog':
          'Add from catalog',
        'Pages.Releases.Deployments.Form.componentsCard.createNew':
          'Create new',
        'Pages.Releases.Deployments.Form.componentsCard.description':
          'Manage components included in this release',
        'Pages.Releases.Deployments.Form.componentsCard.emptyMessage':
          'No components yet.',
        'Pages.Releases.Deployments.Form.componentsCard.title': 'Components',
        'Pages.Releases.Deployments.Form.modes.existing.description':
          'Start from an existing release',
        'Pages.Releases.Deployments.Form.modes.existing.title':
          'Use existing release',
        'Pages.Releases.Deployments.Form.modes.scratch.description':
          'Create a release from scratch',
        'Pages.Releases.Deployments.Form.modes.scratch.title':
          'Start from scratch',
        'Pages.Releases.Deployments.Form.previousRelease':
          'Select a base release',
        'Pages.Releases.Deployments.Form.selectPreviousRelease':
          'Pick a release...',
        'Pages.Releases.Deployments.Form.sources.catalog': 'Catalog',
        'Pages.Releases.Deployments.Form.sources.inherited': 'Inherited',
        'Pages.Releases.Deployments.Form.sources.new': 'New',
        'Pages.Releases.Deployments.Form.statuses.edited': 'Edited',
        'Pages.Releases.Deployments.Form.statuses.removed': 'Removed',
        'Pages.Releases.Deployments.Form.steps.base.description':
          'Choose how to create your release.',
        'Pages.Releases.Deployments.Form.steps.base.title':
          'How do you want to start?',
        'Pages.Releases.Deployments.Form.steps.metadata.description':
          'Define the version and description for this release.',
        'Pages.Releases.Deployments.Form.steps.metadata.title':
          'Release Informations',
        'Pages.Releases.Deployments.Form.title': 'New Release',
        'Pages.Releases.Releases.subtitle': 'Create and manage releases',
      };
      return translations[key] ?? key;
    },
  }),
}));

const releases = [
  {
    components: [
      {
        description: 'Billing API',
        id: 'comp-1',
        name: 'Billing API',
        slug: 'billing-api',
        version: '1.0.0',
      },
    ],
    createdAt: '2026-03-01T00:00:00Z',
    createdBy: { id: 'user-1', name: 'Alice' },
    deploymentZones: [],
    description: 'March release',
    id: 'rel-1',
    instances: [],
    slug: 'v1-0-0',
    version: 'v1.0.0',
  },
];

const components = [
  {
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: { id: 'user-1', name: 'Alice' },
    description: 'Billing API',
    id: 'comp-1',
    name: 'Billing API',
    slug: 'billing-api',
    version: '1.0.0',
  },
  {
    createdAt: '2026-02-01T00:00:00Z',
    createdBy: { id: 'user-1', name: 'Alice' },
    description: 'Portal UI',
    id: 'comp-2',
    name: 'Portal UI',
    slug: 'portal-ui',
    version: '2.0.0',
  },
];

Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  configurable: true,
  value: () => undefined,
});

describe('ReleaseForm', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useSuspenseQueryMock.mockReset();
    useSuspenseQueryMock.mockImplementation(({ queryKey }: any) => {
      if (queryKey?.[0]?._id === 'listComponents') {
        return { data: { hasMore: false, items: components } };
      }
      return { data: releases };
    });
  });

  it('renders the base step inside a gated stepper', () => {
    renderForm();

    // Step 1 content: the base selector with its two mode cards.
    expect(screen.getByText('How do you want to start?')).toBeInTheDocument();
    expect(screen.getByText('Start from scratch')).toBeInTheDocument();
    expect(screen.getByText('Use existing release')).toBeInTheDocument();

    // Stepper chrome: Cancel in the header, Back disabled on the first step,
    // Next gated until the step is valid, and no submit until the last step.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText('Create Release')).not.toBeInTheDocument();

    // It is a guided stepper, not freely navigable tabs.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('skips the base step and opens on the information step when no releases exist', async () => {
    useSuspenseQueryMock.mockImplementation(({ queryKey }: any) => {
      if (queryKey?.[0]?._id === 'listComponents') {
        return { data: { hasMore: false, items: components } };
      }
      return { data: [] };
    });
    renderForm();

    // No base choice is offered; the form opens straight on the version field
    // (the field is lazy-loaded, hence findBy).
    expect(await screen.findByPlaceholderText('v1.0.0')).toBeInTheDocument();
    expect(
      screen.queryByText('How do you want to start?'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Use existing release')).not.toBeInTheDocument();
    // First step of the trimmed stepper: Back is disabled.
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('surfaces step blockers in a tooltip while the base step is incomplete', async () => {
    const user = userEvent.setup();
    renderForm();

    const nextButton = screen.getByRole('button', { name: 'Next' });
    expect(nextButton).toBeDisabled();

    await user.hover(nextButton.parentElement as HTMLElement);

    const [tooltip] = await screen.findAllByRole('tooltip');
    expect(
      within(tooltip).getByText('Complete this step before continuing:'),
    ).toBeInTheDocument();
    expect(
      within(tooltip).getByText('Choose how to create the release.'),
    ).toBeInTheDocument();
  });

  it('advances to the information step after choosing scratch', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText('Start from scratch'));

    const nextButton = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(nextButton).toBeEnabled());
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('v1.0.0')).toBeInTheDocument();
    });
    // Back is now usable to return to the base step.
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('reveals the previous release picker when selecting existing mode', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText('Use existing release'));

    expect(screen.getByText('Select a base release')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // Still on the base step: the metadata fields are not mounted yet.
    expect(screen.queryByPlaceholderText('v1.0.0')).not.toBeInTheDocument();
  });

  it('shows the base badge once an existing release is selected', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText('Use existing release'));
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'v1.0.0' }));

    await waitFor(() => {
      expect(screen.getByText('Based on v1.0.0')).toBeInTheDocument();
    });
  });

  it('reaches the components step with catalog and create actions', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText('Start from scratch'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    const versionInput = await screen.findByPlaceholderText('v1.0.0');
    await user.type(versionInput, 'v2.0.0');

    const nextButton = screen.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(nextButton).toBeEnabled());
    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Add from catalog')).toBeInTheDocument();
      expect(screen.getByText('Create new')).toBeInTheDocument();
      expect(screen.getByText('No components yet.')).toBeInTheDocument();
    });
    // The final step exposes the submit action.
    expect(screen.getByText('Create Release')).toBeInTheDocument();
  });

  it('navigates back to the releases list when cancel is clicked', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText('Start from scratch'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(navigateMock).toHaveBeenCalledWith({ to: '/releases' });
  });
});
