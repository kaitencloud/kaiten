import type { Meta, StoryObj } from '@storybook/react-vite';
import { useQueryClient } from '@tanstack/react-query';
import { type FC, useState } from 'react';
import { webhooksFlagQueryOptions } from '@/lib/feature-flags';
import type { PlainToken } from '../../types';
import { TokenCreatedView, TokenCreateForm } from '../token-create';

// Kaiten Cloud, where the `webhooks` platform flag is on, so the table offers
// every scope. Seeded in the initializer, before the table first reads the
// cache, and so no story asks a flag source Storybook does not have.
const withWebhooksEnabled = (Story: FC) => {
  const queryClient = useQueryClient();
  useState(() =>
    queryClient.setQueryData(webhooksFlagQueryOptions.queryKey, true),
  );
  return <Story />;
};

const fullHeight = (Story: FC) => (
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
);

const meta = {
  title: 'Features/ServiceAccounts/NewToken',
  component: TokenCreateForm,
  decorators: [fullHeight, withWebhooksEnabled],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'responsive' },
    docs: {
      story: { inline: false, iframeHeight: '100vh' },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TokenCreateForm>;

export default meta;
type Story = StoryObj<typeof TokenCreateForm>;

export const Form: Story = {
  args: {
    serviceAccountName: 'SDK',
    onCancel: () => {},
    onSubmit: async () => {},
  },
};

const createdToken: PlainToken = {
  id: 'token-1',
  slug: 'production-sdk',
  name: 'Production SDK',
  token: 'ksh_EXAMPLE_TOKEN_NOT_A_REAL_CREDENTIAL',
  scopes: [
    'read:customers',
    'read:entitlements',
    'read:feature_flags',
    'read:licenses',
    'write:instances',
  ],
  createdAt: '2026-09-19T10:00:00.000Z',
  createdBy: { id: 'user-1', name: 'Splinter' },
  serviceAccountId: 'sa-1',
};

export const Created: StoryObj<typeof TokenCreatedView> = {
  render: () => (
    <TokenCreatedView
      token={createdToken}
      serviceAccountName="SDK"
      onDone={() => {}}
    />
  ),
};
