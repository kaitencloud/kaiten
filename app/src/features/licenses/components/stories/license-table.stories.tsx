import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { type FC, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { LicenseFamilyView } from '@/api-client';
import i18n from '@/lib/i18n/config';
import {
  storyLastWeek,
  storyNow,
  storyYesterday,
} from '@/test-fixtures/storybook-core-fixtures';
import type { LicenseWithInstances } from '../../types';
import { LicenseList } from '../license-list';

// Two versions of Development and two of Enterprise Pro, so each pair shares a
// familyId: that is what makes them the same product, rather than the matching
// name they also happen to have. Development also carries the three lifecycle
// states -- a draft being prepared, the published default, an archived
// predecessor -- which is what the state column, the publish and unarchive
// actions, and the withheld archive and set-as-default actions are there to
// show.
const mockLicenses: LicenseWithInstances[] = [
  {
    createdAt: storyLastWeek,
    description: 'Development license',
    familyId: 'family-dev',
    id: 'lic-dev-v3-2',
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name: 'Development',
    nbInstances: 8,
    type: 'DEVELOPMENT',
    updatedAt: storyYesterday,
    version: '3.2',
    versionName: 'GA',
  },
  {
    createdAt: storyLastWeek,
    description: 'Previous development license',
    familyId: 'family-dev',
    id: 'lic-dev-v3-1',
    isDefault: false,
    lifecycleState: 'ARCHIVED',
    name: 'Development',
    nbInstances: 1,
    type: 'DEVELOPMENT',
    updatedAt: storyLastWeek,
    version: '3.1',
    versionName: 'Legacy',
  },
  {
    createdAt: storyLastWeek,
    description: 'Enterprise license',
    familyId: 'family-enterprise-pro',
    id: 'lic-enterprise-v3-2',
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name: 'Enterprise Pro',
    nbInstances: 12,
    type: 'PAID',
    updatedAt: storyNow,
    version: '3.2',
    versionName: 'Growth',
  },
  {
    createdAt: storyLastWeek,
    description: 'Legacy enterprise license',
    familyId: 'family-enterprise-pro',
    id: 'lic-enterprise-v3-1',
    isDefault: false,
    lifecycleState: 'PUBLISHED',
    name: 'Enterprise Pro',
    nbInstances: 2,
    type: 'PAID',
    updatedAt: storyLastWeek,
    version: '3.1',
    versionName: 'Legacy',
  },
  {
    createdAt: storyLastWeek,
    description: 'Trial license',
    familyId: 'family-trial-30-days',
    id: 'lic-trial-v3-2',
    isDefault: true,
    lifecycleState: 'PUBLISHED',
    name: 'Trial 30 Days',
    nbInstances: 0,
    type: 'TRIAL',
    updatedAt: storyYesterday,
    version: '3.2',
    versionName: 'Sandbox',
  },
  {
    createdAt: storyYesterday,
    description: 'Next development license, still being prepared',
    familyId: 'family-dev',
    id: 'lic-dev-v3-3',
    isDefault: false,
    lifecycleState: 'DRAFT',
    name: 'Development',
    nbInstances: 0,
    type: 'DEVELOPMENT',
    updatedAt: storyYesterday,
    version: '3.3',
    versionName: 'Next',
  },
];

// The family list the API answers for those versions: each family resolves to
// its default version.
const familyView = (
  id: string,
  slug: string,
  currentVersionId: string,
): LicenseFamilyView => {
  const versions = mockLicenses.filter((license) => license.familyId === id);
  return {
    createdAt: storyLastWeek,
    currentVersion: versions.find((license) => license.id === currentVersionId),
    id,
    isPublic: false,
    slug,
    updatedAt: storyYesterday,
    versionCount: versions.length,
  };
};

const mockFamilies: LicenseFamilyView[] = [
  familyView('family-dev', 'development', 'lic-dev-v3-2'),
  familyView('family-enterprise-pro', 'enterprise-pro', 'lic-enterprise-v3-2'),
  familyView('family-trial-30-days', 'trial-30-days', 'lic-trial-v3-2'),
];

function LicenseListWrapper({
  families,
  licenses,
}: {
  families: LicenseFamilyView[];
  licenses: LicenseWithInstances[];
}) {
  const [queryClient] = useState(() => new QueryClient());

  const rootRoute = createRootRoute({
    component: () => (
      <I18nextProvider i18n={i18n}>
        <div className="p-6">
          <LicenseList families={families} licenses={licenses} />
        </div>
      </I18nextProvider>
    ),
  });

  const [history] = useState(() =>
    createMemoryHistory({ initialEntries: ['/licenses'] }),
  );

  const [router] = useState(() =>
    createRouter({
      context: { queryClient },
      history,
      routeTree: rootRoute,
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Licenses/LicenseList',
  component: LicenseList,
  decorators: [
    (Story: FC) => (
      <div style={{ minHeight: '100vh' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof LicenseList>;

export default meta;

type Story = StoryObj<typeof LicenseList>;

export const Default: Story = {
  render: () => (
    <LicenseListWrapper families={mockFamilies} licenses={mockLicenses} />
  ),
};

export const Empty: Story = {
  render: () => <LicenseListWrapper families={[]} licenses={[]} />,
};

export const WithoutInstances: Story = {
  render: () => (
    <LicenseListWrapper
      families={mockFamilies}
      licenses={mockLicenses.map((license) => ({ ...license, nbInstances: 0 }))}
    />
  ),
};
