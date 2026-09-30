import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC } from 'react';
import { TokenListItem } from '../token-list';

// --- Mock Data ---

const lastWeek = new Date(Date.now() - 7 * 86400000);
const nextMonth = new Date(Date.now() + 30 * 86400000);
const lastMonth = new Date(Date.now() - 30 * 86400000);

// --- Meta ---

const meta = {
  title: 'Features/ServiceAccounts/TokenListItem',
  component: TokenListItem,
  decorators: [
    (Story: FC) => (
      <div className="max-w-2xl mx-auto p-6">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    onRevoke: {
      action: 'revoke-token',
      description: 'Callback when revoke button is clicked',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TokenListItem>;

export default meta;
type Story = StoryObj<typeof TokenListItem>;

// --- Stories ---

export const ActiveDataToken: Story = {
  args: {
    token: {
      id: 'token-1',
      name: 'Production SDK',
      scopes: [
        'read:customers',
        'read:entitlements',
        'read:feature_flags',
        'read:licenses',
        'write:instances',
      ],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Active token holding the Data plane preset: reads, and usage reports.',
      },
    },
  },
};

export const ActiveControlToken: Story = {
  args: {
    token: {
      id: 'token-2',
      name: 'Infrastructure Control Token',
      scopes: [
        'write:customers',
        'write:instances',
        'write:licenses',
        'write:deployment_zones',
        'write:releases',
      ],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Active token with the write scopes of fleet automation.',
      },
    },
  },
};

export const CombinedScopesToken: Story = {
  args: {
    token: {
      id: 'token-3',
      name: 'Full Access Token',
      scopes: [
        'read:feature_flags',
        'write:entitlements',
        'write:customers',
        'write:instances',
        'write:licenses',
      ],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Token combining SDK reads with catalog and fleet writes.',
      },
    },
  },
};

export const CustomToken: Story = {
  args: {
    token: {
      id: 'token-4',
      name: 'Custom Scoped Token',
      scopes: ['read:customers', 'read:licenses'],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Token with custom type and limited read-only scopes.',
      },
    },
  },
};

export const WithExpiration: Story = {
  args: {
    token: {
      id: 'token-5',
      name: 'Expiring Token',
      scopes: ['read:feature_flags'],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
      expiresAt: nextMonth.toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Active token with a future expiration date.',
      },
    },
  },
};

export const Expired: Story = {
  args: {
    token: {
      id: 'token-6',
      name: 'Old Production Token',
      scopes: ['read:feature_flags', 'write:entitlements'],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
      expiresAt: lastMonth.toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Expired token (past expiration date). Revoke button is hidden.',
      },
    },
  },
};

export const Revoked: Story = {
  args: {
    token: {
      id: 'token-7',
      name: 'Revoked Access Token',
      scopes: ['write:customers', 'write:licenses'],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
      revokedAt: lastWeek.toISOString(),
      revokedBy: {
        id: 'user-1',
        name: 'Admin',
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Revoked token with revocation details. Revoke button is hidden.',
      },
    },
  },
};

export const WithExternalId: Story = {
  args: {
    token: {
      id: 'token-8',
      name: 'External Service Token',
      scopes: ['read:feature_flags'],
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
      createdAt: new Date().toISOString(),
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Token with an external ID reference.',
      },
    },
  },
};

export const NoScopes: Story = {
  args: {
    token: {
      id: 'token-9',
      name: 'Empty Scopes Token',
      scopes: null,
      createdAt: new Date().toISOString(),
      createdBy: {
        id: 'user-1',
        name: 'Admin',
      },
      serviceAccountId: 'sa-1',
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Token with no scopes assigned (null).',
      },
    },
  },
};
