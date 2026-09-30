import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n/config';
import {
  type LinkedDeploymentZone,
  ReleaseLinkedDeploymentZonesDisplay,
} from '../release-overview/displays/release-linked-deployment-zones-display';

// --- Mock Data ---

const zones: LinkedDeploymentZone[] = [
  {
    id: 'zone-1',
    name: 'Production EU',
    type: 'production',
    description: 'European production servers',
  },
  {
    id: 'zone-2',
    name: 'Production US',
    type: 'production',
    description: 'US production servers',
  },
  {
    id: 'zone-3',
    name: 'Staging',
    type: 'staging',
    description: 'Pre-production',
  },
];

// --- Meta ---

const meta = {
  title: 'Features/Releases/ReleaseLinkedDeploymentZonesDisplay',
  component: ReleaseLinkedDeploymentZonesDisplay,
  decorators: [
    (Story: FC) => (
      <I18nextProvider i18n={i18n}>
        <div className="max-w-md mx-auto p-6">
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof ReleaseLinkedDeploymentZonesDisplay>;

export default meta;
type Story = StoryObj<typeof ReleaseLinkedDeploymentZonesDisplay>;

// --- Stories ---

export const NotDeployed: Story = {
  args: {
    deploymentZones: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Release running on no zone shows "Not deployed" text.',
      },
    },
  },
};

export const SingleZone: Story = {
  args: {
    deploymentZones: [zones[2]],
  },
  parameters: {
    docs: {
      description: {
        story: 'Release running on a single zone shows "1 zone" link.',
      },
    },
  },
};

export const MultipleZones: Story = {
  args: {
    deploymentZones: zones,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Release running on multiple zones shows "3 zones" link with a dialog listing all zones.',
      },
    },
  },
};
