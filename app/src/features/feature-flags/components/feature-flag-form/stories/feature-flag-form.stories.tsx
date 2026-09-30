import type { Meta, StoryObj } from '@storybook/react-vite';
import { useQueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { FC } from 'react';
import { useState } from 'react';
import { FeatureFlagForm } from '../feature-flag-form';

// Wrapper component that provides router context
function FormWrapper({ featureFlag }: { featureFlag?: any } = {}) {
  const queryClient = useQueryClient();

  const rootRoute = createRootRoute({
    component: () => <FeatureFlagForm featureFlag={featureFlag} />,
  });

  const [history] = useState(() =>
    createMemoryHistory({
      initialEntries: ['/'],
    }),
  );

  const [router] = useState(() =>
    createRouter({
      routeTree: rootRoute,
      history,
      context: {
        queryClient,
      },
    }),
  );

  return <RouterProvider router={router} />;
}

const meta = {
  title: 'Features/FeatureFlags/FeatureFlagForm',
  component: FeatureFlagForm,
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
    viewport: {
      defaultViewport: 'responsive',
    },
    docs: {
      description: {
        component:
          'FeatureFlagForm is a full-page form for creating and editing feature flags. Creation uses a guided stepper that walks through each step in order, while editing exposes the steps as freely navigable tabs.',
      },
      // Render inline in autodocs (like the other full-page form stories).
      // `inline: false` nests each story in its own iframe, which the
      // Storybook vitest runner intermittently fails to connect to
      // ("Cannot connect to the iframe").
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FeatureFlagForm>;

export default meta;

/**
 * Default story showing the create page as a guided stepper that forces the
 * user through each step in order.
 */
export const Default: StoryObj<typeof FeatureFlagForm> = {
  render: () => <FormWrapper />,
};

/**
 * Form pre-filled with a **Boolean** feature flag.
 * This is the simplest type, often used for toggling features.
 */
export const BooleanTypePrefilled: StoryObj<typeof FeatureFlagForm> = {
  render: () => {
    const mockFeatureFlag = {
      id: 'bool-flag-id',
      name: 'Dark Mode',
      description: 'Enable dark mode for the application',
      slug: 'dark-mode',
      enabled: true,
      type: 'boolean' as const,
      variants: [
        {
          name: 'on',
          description: 'Dark mode enabled',
          value: true,
        },
        {
          name: 'off',
          description: 'Dark mode disabled',
          value: false,
        },
      ],
      default_variant: { type: 'basic', value: 'off' },
      targetings: [
        {
          type: 'basic' as const,
          name: 'Beta Testers',
          rule: 'user.isBetaTester == true',
          variant: 'on',
        },
      ],
      event_name: 'dark_mode_evaluated',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return <FormWrapper featureFlag={mockFeatureFlag} />;
  },
};

/**
 * Form pre-filled with a **String** feature flag.
 * Useful for configuration values like theme colors, text labels, or layout modes.
 */
export const StringTypePrefilled: StoryObj<typeof FeatureFlagForm> = {
  render: () => {
    const mockFeatureFlag = {
      id: 'string-flag-id',
      name: 'UI Theme',
      description: 'Application color theme configuration',
      slug: 'ui-theme',
      enabled: true,
      type: 'string' as const,
      variants: [
        {
          name: 'light',
          description: 'Light theme',
          value: 'light-theme-v2',
        },
        {
          name: 'dark',
          description: 'Dark theme',
          value: 'dark-theme-v1',
        },
        {
          name: 'system',
          description: 'Follow system preference',
          value: 'system-auto',
        },
      ],
      default_variant: { type: 'basic', value: 'system' },
      targetings: [],
      event_name: 'ui_theme_evaluated',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return <FormWrapper featureFlag={mockFeatureFlag} />;
  },
};

/**
 * Form pre-filled with a **Number** feature flag.
 * Ideal for limits, timeouts, or numerical configuration settings.
 */
export const NumberTypePrefilled: StoryObj<typeof FeatureFlagForm> = {
  render: () => {
    const mockFeatureFlag = {
      id: 'number-flag-id',
      name: 'Max Upload Size',
      description: 'Maximum file upload size in megabytes',
      slug: 'max-upload-size',
      enabled: true,
      type: 'number' as const,
      variants: [
        {
          name: 'basic',
          description: 'Basic tier limit',
          value: 10,
        },
        {
          name: 'pro',
          description: 'Pro tier limit',
          value: 100,
        },
        {
          name: 'enterprise',
          description: 'Enterprise tier limit',
          value: 1000,
        },
      ],
      default_variant: { type: 'basic', value: 'basic' },
      targetings: [
        {
          type: 'basic' as const,
          name: 'Pro Users',
          rule: 'organization.plan == "pro"',
          variant: 'pro',
        },
        {
          type: 'basic' as const,
          name: 'Enterprise Users',
          rule: 'organization.plan == "enterprise"',
          variant: 'enterprise',
        },
      ],
      event_name: 'max_upload_size_evaluated',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return <FormWrapper featureFlag={mockFeatureFlag} />;
  },
};

/**
 * Form pre-filled with an **Object (JSON)** feature flag.
 * Perfect for complex configurations like API settings or feature toggles with metadata.
 */
export const ObjectTypePrefilled: StoryObj<typeof FeatureFlagForm> = {
  render: () => {
    const mockFeatureFlag = {
      id: 'object-flag-id',
      name: 'API Configuration',
      description: 'API endpoint and timeout settings',
      slug: 'api-config',
      enabled: true,
      type: 'object' as const,
      variants: [
        {
          name: 'production',
          description: 'Production environment settings',
          value: {
            endpoint: 'https://api.example.com',
            timeout: 5000,
            retries: 3,
          },
        },
        {
          name: 'staging',
          description: 'Staging environment settings',
          value: {
            endpoint: 'https://staging-api.example.com',
            timeout: 10000,
            retries: 5,
            debug: true,
          },
        },
      ],
      default_variant: { type: 'basic', value: 'production' },
      targetings: [
        {
          type: 'basic' as const,
          name: 'Internal QA',
          rule: 'user.email.endsWith("@company.com")',
          variant: 'staging',
        },
      ],
      event_name: 'api_config_evaluated',
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return <FormWrapper featureFlag={mockFeatureFlag} />;
  },
};
