import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import { billingCapabilitiesProfiles } from '../../../../../e2e/app/_support/model/billing-capabilities';
import type { LicenseWithInstances } from '../../types';
import { LicenseVersionsTable } from '../license-versions-table';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  // Records where it leads instead of navigating.
  Link: ({
    children,
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        mockNavigate({ to });
      }}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    buildLocation: ({ params }: { params: { licenseSlug: string } }) => ({
      pathname: `/licenses/${params.licenseSlug}`,
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: unknown) => {
      if (typeof options === 'string') {
        return options;
      }

      const translations: Record<string, string> = {
        'Pages.Licenses.Mutation.Form.Types.Development': 'Development',
        'Pages.Licenses.Mutation.Form.Types.Paid': 'Paid',
        'Pages.Licenses.Mutation.Form.Types.Trial': 'Trial',
        'Pages.Licenses.Lifecycle.ARCHIVED': 'Archived',
        'Pages.Licenses.Lifecycle.DRAFT': 'Draft',
        'Pages.Licenses.Lifecycle.PUBLISHED': 'Published',
        'Pages.Licenses.List.unknownVersion': 'Unknown version',
        'Pages.Licenses.VersionsTable.Columns.actions': 'Actions',
        'Pages.Licenses.VersionsTable.Columns.default': 'Default',
        'Pages.Licenses.VersionsTable.Columns.instances': 'Instances',
        'Pages.Licenses.VersionsTable.Columns.lifecycleState': 'State',
        'Pages.Licenses.VersionsTable.Columns.pricingType': 'Pricing',
        'Pages.Licenses.Commercial.PricingTypes.CUSTOM': 'Custom',
        'Pages.Licenses.Commercial.PricingTypes.FREE': 'Free',
        'Pages.Licenses.Commercial.PricingTypes.PAID': 'Billed',
        'Pages.Licenses.VersionsTable.Columns.versionName': 'Version name',
        'Pages.Licenses.VersionsTable.Columns.type': 'Type',
        'Pages.Licenses.VersionsTable.Columns.version': 'Version',
        'Pages.Licenses.VersionsTable.default': 'Default',
      };

      return translations[key] ?? key;
    },
  }),
}));

// Like the real one, the actions area is marked data-row-actions and holds a
// disabled button inside a wrapper, which is where a click on it lands.
vi.mock('../license-versions-table-actions', () => ({
  LicenseVersionsTableActions: () => (
    <div data-row-actions>
      <span>Row action</span>
      <span data-testid="disabled-action-wrapper">
        <button type="button" disabled>
          Unavailable action
        </button>
      </span>
    </div>
  ),
}));

const licenses: LicenseWithInstances[] = [
  {
    description: 'Community active default',
    id: 'license-community-v2',
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name: 'Community',
    nbInstances: 21,
    slug: 'community-v2',
    type: 'DEVELOPMENT',
    version: '2',
    versionName: 'GA',
  } as LicenseWithInstances,
  {
    description: 'Community inactive',
    id: 'license-community-v1',
    isDefault: false,
    lifecycleState: 'ARCHIVED',
    name: 'Community',
    nbInstances: 0,
    type: 'TRIAL',
    version: '1',
    versionName: 'Legacy',
  } as LicenseWithInstances,
];

let queryClient: QueryClient;

// The table reads whether billing is on, which the shell reads once for the page.
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderTable = (table: ReactElement) => render(table, { wrapper });

describe('LicenseVersionsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  it('renders expected columns', () => {
    renderTable(<LicenseVersionsTable licenses={licenses} />);

    expect(
      screen.getByRole('columnheader', { name: 'Version name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Version' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Type' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'State' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Default' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Instances' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Actions' }),
    ).toBeInTheDocument();
  });

  // Even a lone version can be published, archived or unarchived.
  it('keeps the actions column for a family with a single version', () => {
    renderTable(<LicenseVersionsTable licenses={licenses.slice(0, 1)} />);

    expect(
      screen.getByRole('columnheader', { name: 'Actions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Row action')).toBeInTheDocument();
  });

  // The state is what tells a vendor which versions the family can serve,
  // and which ones the set-as-default action will be withheld from.
  it('shows each version\'s lifecycle state', () => {
    renderTable(<LicenseVersionsTable licenses={licenses} />);

    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('links each version to its license page, from its name or anywhere on its row', () => {
    renderTable(<LicenseVersionsTable licenses={licenses} />);

    expect(screen.getByRole('link', { name: 'GA' })).toHaveAttribute(
      'href',
      '/licenses/community-v2',
    );

    fireEvent.click(screen.getByText('Development'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/licenses/community-v2',
    });
  });

  // A disabled button ignores the pointer, so the click lands on its wrapper;
  // it is still a click on the row's actions, not on the row.
  it('does not open the version when a click lands in its actions', () => {
    renderTable(<LicenseVersionsTable licenses={licenses.slice(0, 1)} />);

    fireEvent.click(screen.getByText('Row action'));
    fireEvent.click(screen.getByTestId('disabled-action-wrapper'));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('neither links nor navigates when slug is missing', () => {
    renderTable(<LicenseVersionsTable licenses={licenses} />);

    expect(
      screen.queryByRole('link', { name: 'Legacy' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Trial'));

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('hides pagination controls because pagination is explicitly disabled', () => {
    renderTable(<LicenseVersionsTable licenses={licenses} />);

    expect(screen.queryByText('Rows per page')).not.toBeInTheDocument();
  });

  describe('how each version is sold', () => {
    it('has no such column where billing is not there, which would read Custom everywhere', () => {
      renderTable(<LicenseVersionsTable licenses={licenses} />);

      expect(
        screen.queryByRole('columnheader', { name: 'Pricing' }),
      ).not.toBeInTheDocument();
    });

    it('shows the pricing type of each version where billing is on', async () => {
      server.use(
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stack(),
        }),
      );
      const sold = [
        { ...licenses[0], pricingType: 'PAID' },
        { ...licenses[1], pricingType: 'FREE' },
      ] as LicenseWithInstances[];

      renderTable(<LicenseVersionsTable licenses={sold} />);

      expect(
        await screen.findByRole('columnheader', { name: 'Pricing' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Billed')).toBeInTheDocument();
      expect(screen.getByText('Free')).toBeInTheDocument();
    });

    it('reads a version the API sent no pricing type for as the API creates one: custom', async () => {
      server.use(
        handleGetBillingCapabilities({
          body: billingCapabilitiesProfiles.stack(),
        }),
      );

      renderTable(<LicenseVersionsTable licenses={licenses.slice(0, 1)} />);

      expect(await screen.findByText('Custom')).toBeInTheDocument();
    });
  });
});
