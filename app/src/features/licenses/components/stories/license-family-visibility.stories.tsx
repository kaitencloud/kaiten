import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen } from 'storybook/test';
import type { LicenseFamilyView } from '@/api-client';
import { handleGetBillingCapabilities } from '@/api-client/msw.gen';
import {
  storyLastWeek,
  storyNow,
  storyYesterday,
} from '@/test-fixtures/storybook-core-fixtures';
import { billingCapabilitiesProfiles } from '@/test-fixtures/storybook-billing-fixtures';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import type { LicenseWithInstances } from '../../types';
import { LicenseList } from '../license-list';

const meta = {
  title: 'Features/Licenses/LicenseFamilyVisibility',
  component: LicenseList,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof LicenseList>;

export default meta;
type Story = StoryObj<typeof LicenseList>;

const license = (
  id: string,
  familyId: string,
  name: string,
  version: string,
): LicenseWithInstances => ({
  createdAt: storyLastWeek,
  description: `${name} license`,
  familyId,
  id,
  isDefault: true,
  lifecycleState: 'PUBLISHED',
  name,
  nbInstances: 3,
  slug: id,
  type: 'PAID',
  updatedAt: storyYesterday,
  version,
  versionName: 'GA',
});

const LICENSES = [
  license('enterprise-v3', 'family-enterprise', 'Enterprise', '3'),
  license('starter-v1', 'family-starter', 'Starter', '1'),
];

const family = (
  license: LicenseWithInstances,
  slug: string,
  isPublic: boolean,
): LicenseFamilyView => ({
  createdAt: storyLastWeek,
  currentVersion: license,
  id: license.familyId ?? license.id,
  isPublic,
  slug,
  updatedAt: storyNow,
  versionCount: 1,
});

const FAMILIES = [
  family(LICENSES[0], 'enterprise', true),
  family(LICENSES[1], 'starter', false),
];

const list = () => (
  <StorybookRouter initialEntries={['/catalog/licenses']}>
    <div className="p-6">
      <LicenseList families={FAMILIES} licenses={LICENSES} />
    </div>
  </StorybookRouter>
);

// Where billing is on, each family says whether it is listed in the public catalogue
// and has the switch to list it or take it out. Families are private until listed.
export const PublicCatalogue: Story = {
  parameters: {
    msw: {
      handlers: [
        handleGetBillingCapabilities({ body: billingCapabilitiesProfiles.stack() }),
      ],
    },
  },
  render: list,
  play: async () => {
    const listed = await screen.findByRole('switch', {
      name: 'List Enterprise in the public catalogue',
    });

    await expect(listed).toBeChecked();
    await expect(
      screen.getByRole('switch', { name: 'List Starter in the public catalogue' }),
    ).not.toBeChecked();
    // One family is public, and says so.
    await expect(screen.getAllByText('Public')).toHaveLength(1);
  },
};

// Where billing is off the catalogue is not a matter of this console: no switch and no
// badge, whatever the API says of the family.
export const BillingOff: Story = {
  render: list,
  play: async () => {
    await expect(await screen.findByText('Enterprise')).toBeInTheDocument();
    await expect(screen.queryByRole('switch')).toBeNull();
    await expect(screen.queryByText('Public')).toBeNull();
  },
};
