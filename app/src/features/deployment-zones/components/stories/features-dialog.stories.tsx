import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FC } from 'react';
import { I18nextProvider } from 'react-i18next';
import { TableJsonDialog } from '@/functionals/table';
import i18n from '@/lib/i18n/config';

// --- Mock Data ---

const simpleFeatures = {
  enableNewUI: true,
  maxConcurrentUsers: 100,
};

const complexFeatures = {
  authentication: {
    methods: ['oauth', 'saml', 'ldap'],
    sessionTimeout: 3600,
    mfaRequired: true,
  },
  features: {
    darkMode: true,
    analytics: {
      enabled: true,
      provider: 'google-analytics',
      trackingId: 'UA-123456-1',
    },
    notifications: {
      email: true,
      sms: false,
      push: true,
    },
  },
  limits: {
    storage: '100GB',
    bandwidth: '1TB',
    users: 500,
  },
};

const emptyFeatures = {};

// --- Meta ---

const meta = {
  title: 'Functionals/Table/TableJsonDialog',
  component: TableJsonDialog,
  decorators: [
    (Story: FC) => (
      <I18nextProvider i18n={i18n}>
        <div style={{ padding: 24 }}>
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TableJsonDialog>;

export default meta;
type Story = StoryObj<typeof TableJsonDialog>;

// --- Stories ---

export const Simple: Story = {
  args: {
    title: 'Features Configuration',
    description: 'JSON metadata configuration for this deployment zone.',
    triggerAriaLabel: 'Open features configuration',
    value: simpleFeatures,
  },
  parameters: {
    docs: {
      description: {
        story: 'Simple features configuration with basic key-value pairs.',
      },
    },
  },
};

export const Complex: Story = {
  args: {
    title: 'Features Configuration',
    description: 'JSON metadata configuration for this deployment zone.',
    triggerAriaLabel: 'Open features configuration',
    value: complexFeatures,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Complex nested features configuration showing authentication, features, and limits.',
      },
    },
  },
};

export const Empty: Story = {
  args: {
    title: 'Features Configuration',
    triggerAriaLabel: 'Open features configuration',
    value: emptyFeatures,
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty features object (should not be rendered in real use).',
      },
    },
  },
};
