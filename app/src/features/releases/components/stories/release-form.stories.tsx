import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useQueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { Component } from '@/api-client';
import { handleListComponents } from '@/api-client/msw.gen';
import type { ReleaseManagementOverviewRelease } from '@/domains/release-management';
import i18n from '@/lib/i18n/config';
import { graphqlOperationHandler } from '@/e2e/msw/handler-factory';
import { onePage } from '@/test-fixtures/storybook-handlers';
import { findVisibleByRole } from '@/test-fixtures/storybook-test-utils';
import { ReleaseForm } from '../release-form';

const mockComponents: Component[] = [
  {
    createdAt: '2026-03-18T08:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Release Manager' },
    description: 'Handles user sessions and token issuance',
    id: 'component-auth-service',
    name: 'Auth Service',
    slug: 'auth-service',
    version: 'v2.3.0',
  },
  {
    createdAt: '2026-03-15T08:00:00.000Z',
    createdBy: { id: 'user-2', name: 'Platform Team' },
    description: 'Routes external traffic to the platform APIs',
    id: 'component-api-gateway',
    name: 'API Gateway',
    slug: 'api-gateway',
    version: 'v4.1.0',
  },
  {
    createdAt: '2026-03-10T08:00:00.000Z',
    createdBy: { id: 'user-2', name: 'Platform Team' },
    description: 'Delivers asynchronous notifications',
    id: 'component-notification-hub',
    name: 'Notification Hub',
    slug: 'notification-hub',
    version: 'v1.9.2',
  },
];

const mockReleases: ReleaseManagementOverviewRelease[] = [
  {
    components: [
      {
        createdAt: '2026-03-11T08:00:00.000Z',
        createdBy: { id: 'user-1', name: 'Release Manager' },
        description: 'Handles user sessions and token issuance',
        id: 'component-auth-service',
        name: 'Auth Service',
        previousComponentId: null,
        slug: 'auth-service',
        version: 'v2.3.0',
      },
      {
        createdAt: '2026-03-09T08:00:00.000Z',
        createdBy: { id: 'user-2', name: 'Platform Team' },
        description: 'Routes external traffic to the platform APIs',
        id: 'component-api-gateway',
        name: 'API Gateway',
        previousComponentId: null,
        slug: 'api-gateway',
        version: 'v4.0.0',
      },
    ],
    createdAt: '2026-03-12T09:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Release Manager' },
    deploymentZones: [
      {
        createdAt: '2026-03-12T11:00:00.000Z',
        description: 'European production cluster',
        id: 'zone-production-eu',
        name: 'Production EU',
        releaseId: 'release-1-4-0',
        slug: 'production-eu',
        type: 'production',
        updatedAt: '2026-03-19T07:30:00.000Z',
      },
    ],
    description: 'Stable production baseline before the April release train',
    id: 'release-1-4-0',
    instances: [
      {
        customer: { id: 'customer-acme', name: 'Acme Corp' },
        deploymentZoneId: 'zone-production-eu',
        description: 'Production cluster for Acme',
        id: 'instance-acme-production',
        name: 'Acme Production',
        slug: 'acme-production',
      },
    ],
    slug: 'release-1-4-0',
    version: 'v1.4.0',
  },
  {
    components: [
      {
        createdAt: '2026-03-15T08:00:00.000Z',
        createdBy: { id: 'user-2', name: 'Platform Team' },
        description: 'Routes external traffic to the platform APIs',
        id: 'component-api-gateway-4-1',
        name: 'API Gateway',
        previousComponentId: 'component-api-gateway',
        slug: 'api-gateway-v4-1-0',
        version: 'v4.1.0',
      },
      {
        createdAt: '2026-03-16T08:00:00.000Z',
        createdBy: { id: 'user-3', name: 'Messaging Team' },
        description: 'Delivers asynchronous notifications',
        id: 'component-notification-hub',
        name: 'Notification Hub',
        previousComponentId: null,
        slug: 'notification-hub',
        version: 'v1.9.2',
      },
    ],
    createdAt: '2026-03-20T10:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Release Manager' },
    deploymentZones: [
      {
        createdAt: '2026-03-20T10:30:00.000Z',
        description: 'Pre-production environment',
        id: 'zone-staging',
        name: 'Staging',
        releaseId: 'release-1-5-0-rc1',
        slug: 'staging',
        type: 'staging',
        updatedAt: '2026-03-24T09:00:00.000Z',
      },
    ],
    description: 'Release candidate used by staging before general rollout',
    id: 'release-1-5-0-rc1',
    instances: [
      {
        customer: { id: 'customer-beta', name: 'Beta Labs' },
        deploymentZoneId: 'zone-staging',
        description: 'Staging validation instance',
        id: 'instance-beta-staging',
        name: 'Beta Staging',
        slug: 'beta-staging',
      },
    ],
    slug: 'release-1-5-0-rc1',
    version: 'v1.5.0-rc1',
  },
];

/**
 * The component catalog and the previous releases the form reads, the second
 * over GraphQL.
 */
const releaseFormHandlers = ({
  availableComponents = mockComponents,
  releases = mockReleases,
}: {
  availableComponents?: Component[];
  releases?: ReleaseManagementOverviewRelease[];
} = {}) => [
  handleListComponents(onePage(availableComponents)),
  graphqlOperationHandler({
    GetReleaseManagementOverview: () => ({
      releases: { hasMore: false, items: releases, nextCursor: null },
    }),
  }),
];

function FormWrapper() {
  const queryClient = useQueryClient();

  const rootRoute = createRootRoute({
    component: () => (
      <I18nextProvider i18n={i18n}>
        <ReleaseForm />
      </I18nextProvider>
    ),
  });

  const [history] = useState(() =>
    createMemoryHistory({ initialEntries: ['/'] }),
  );

  const [router] = useState(() =>
    createRouter({
      routeTree: rootRoute,
      history,
      context: { queryClient },
    }),
  );

  return <RouterProvider router={router} />;
}

const meta = {
  title: 'Features/Releases/ReleaseForm',
  component: ReleaseForm,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: releaseFormHandlers() },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ReleaseForm>;

export default meta;
type Story = StoryObj<typeof ReleaseForm>;

export const Default: Story = {
  render: () => <FormWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Two-phase release creation flow with catalog data and previous releases available for inheritance.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('heading', { name: 'Choose a release base' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: /^Start from scratch/ }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: /^Use existing release/ }),
    ).toBeVisible();
  },
};

/**
 * Scratch-mode walk through the guided stepper: picks "Start from scratch",
 * advances to the information step, fills the version, then steps to the
 * components step and asserts the empty catalog affordance and submit action.
 */
export const InteractiveScratchMode: Story = {
  render: () => <FormWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: scratch base → information step (version) → components step.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Base step: choose scratch, then advance to the information step.
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Start from scratch/ }),
    );
    const toInformation = await canvas.findByRole('button', { name: 'Next' });
    await waitFor(() => expect(toInformation).toBeEnabled());
    await userEvent.click(toInformation);

    // Information step: a version is required before continuing.
    await userEvent.type(
      await canvas.findByLabelText('Version', { exact: true }),
      'v1.6.0',
    );
    const toComponents = canvas.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(toComponents).toBeEnabled());
    await userEvent.click(toComponents);

    // Components step: empty catalog affordance and the final submit action.
    await expect(
      await canvas.findByText(
        'No components yet. Add from catalog or create a new one.',
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Add from catalog' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Create Release' }),
    ).toBeEnabled();
  },
};

/**
 * Existing-release base selection: switches to "Use existing release",
 * picks v1.5.0-rc1 in the combobox and asserts the inherited base banner.
 */
export const InteractiveExistingReleaseMode: Story = {
  render: () => <FormWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: existing-release mode + base selection by version.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: /^Use existing release/ }),
    );

    const combobox = (await canvas.findAllByRole('combobox'))[0];
    await userEvent.click(combobox);

    const body = within(document.body);
    await userEvent.click(
      await body.findByRole('option', { name: 'v1.5.0-rc1' }),
    );

    // The chosen base is reflected in the header badge and unlocks the step.
    await expect(await canvas.findByText('Based on v1.5.0-rc1')).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Next' })).toBeEnabled(),
    );
  },
};

export const EmptyCatalog: Story = {
  render: () => <FormWrapper />,
  parameters: {
    msw: { handlers: releaseFormHandlers({ availableComponents: [] }) },
    docs: {
      description: {
        story:
          'Release form with historical releases available but no standalone components in the catalog.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Base step → information step.
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Start from scratch/ }),
    );
    const toInformation = await canvas.findByRole('button', { name: 'Next' });
    await waitFor(() => expect(toInformation).toBeEnabled());
    await userEvent.click(toInformation);

    // Information step (version required) → components step.
    await userEvent.type(
      await canvas.findByLabelText('Version', { exact: true }),
      'v1.6.0',
    );
    const toComponents = canvas.getByRole('button', { name: 'Next' });
    await waitFor(() => expect(toComponents).toBeEnabled());
    await userEvent.click(toComponents);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Add from catalog' }),
    );

    const dialog = await findVisibleByRole(document.body, 'dialog', {
      name: 'Add components from catalog',
    });
    const dialogScope = within(dialog);
    await expect(
      await findVisibleByRole(dialog, 'heading', {
        name: 'Add components from catalog',
      }),
    ).toBeVisible();
    await expect(
      dialogScope.getByText('No components match this search.'),
    ).toBeVisible();
  },
};

/**
 * No historical releases to inherit from: the base step is skipped entirely and
 * the stepper opens directly on the information step in scratch mode.
 */
export const NoExistingReleases: Story = {
  render: () => <FormWrapper />,
  parameters: {
    msw: { handlers: releaseFormHandlers({ releases: [] }) },
    docs: {
      description: {
        story:
          'Without any existing release, the base selection is skipped and the form starts on the information step.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The form opens straight on the information step.
    await expect(
      await canvas.findByLabelText('Version', { exact: true }),
    ).toBeVisible();

    // No base selection is offered at all.
    await expect(
      canvas.queryByRole('heading', { name: 'Choose a release base' }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: /^Use existing release/ }),
    ).not.toBeInTheDocument();
  },
};
