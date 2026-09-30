import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC } from 'react';
import type { ServiceAccount } from '../../types';
import { ServiceAccountList } from '../service-account-list';

// --- Mock Data ---

const now = new Date().toISOString();
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString();
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString();
const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString();

const mockServiceAccounts: ServiceAccount[] = [
  {
    id: 'sa-1',
    slug: 'production-api',
    name: 'Production API',
    createdAt: lastMonth,
    tokens: [
      {
        id: 'token-1',
        slug: 'main-data-token',
        name: 'Main Data Token',
        scopes: ['read:feature_flags', 'write:entitlements'],
        createdBy: {
          id: 'user-1',
          name: 'Admin',
        },
        createdAt: lastMonth,
        serviceAccountId: 'sa-1',
      },
      {
        id: 'token-2',
        slug: 'infrastructure-control',
        name: 'Infrastructure Control',
        scopes: [
          'write:customers',
          'write:instances',
          'write:licenses',
          'write:deployment_zones',
        ],
        createdBy: {
          id: 'user-2',
          name: 'DevOps',
        },
        createdAt: lastMonth,
        serviceAccountId: 'sa-1',
        expiresAt: nextMonth,
      },
    ],
  },
  {
    id: 'sa-2',
    slug: 'ci-cd-pipeline',
    name: 'CI/CD Pipeline',
    createdAt: lastWeek,
    tokens: [
      {
        id: 'token-3',
        slug: 'deploy-token',
        name: 'Deploy Token',
        scopes: ['read:feature_flags', 'write:releases'],
        createdBy: {
          id: 'user-2',
          name: 'CI/CD',
        },
        createdAt: lastWeek,
        serviceAccountId: 'sa-2',
      },
    ],
  },
  {
    id: 'sa-3',
    slug: 'monitoring-service',
    name: 'Monitoring Service',
    createdAt: now,
    tokens: null,
  },
];

// --- Meta ---

const meta = {
  title: 'Features/ServiceAccounts/ServiceAccountList',
  component: ServiceAccountList,
  decorators: [
    (Story: FC) => (
      <div
        style={{
          minHeight: '100vh',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'responsive' },
    docs: {
      story: { inline: false, iframeHeight: '100vh' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ServiceAccountList>;

export default meta;
type Story = StoryObj<typeof ServiceAccountList>;

// --- Stories ---

export const Default: Story = {
  args: {
    serviceAccounts: mockServiceAccounts,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Service account management panel with filters, add action, and accordion rows.',
      },
    },
  },
};

export const Empty: Story = {
  args: {
    serviceAccounts: [],
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty state when no service accounts exist.',
      },
    },
  },
};

export const SingleAccountWithTokens: Story = {
  args: {
    serviceAccounts: [mockServiceAccounts[0]],
  },
  parameters: {
    docs: {
      description: {
        story: 'Single service account with multiple tokens.',
      },
    },
  },
};

export const AccountWithNoTokens: Story = {
  args: {
    serviceAccounts: [mockServiceAccounts[2]],
  },
  parameters: {
    docs: {
      description: {
        story: 'Service account with no tokens (null).',
      },
    },
  },
};

export const ManyAccounts: Story = {
  args: {
    serviceAccounts: Array.from({ length: 8 }, (_, i) => ({
      id: `sa-${i + 1}`,
      slug: `service-account-${i + 1}`,
      name: `Service Account ${i + 1}`,
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      tokens:
        i % 3 === 0
          ? null
          : Array.from({ length: (i % 3) + 1 }, (_, j) => ({
              id: `token-${i}-${j}`,
              slug: `token-${i}-${j}`,
              name: `Token ${j + 1}`,
              scopes: ['read:feature_flags'],
              createdBy: {
                id: `user-${i}`,
                name: `User ${i}`,
              },
              createdAt: new Date(Date.now() - i * 86400000).toISOString(),
              serviceAccountId: `sa-${i + 1}`,
            })),
    })),
  },
  parameters: {
    docs: {
      description: {
        story: 'Many service accounts to test scrolling and layout.',
      },
    },
  },
};
