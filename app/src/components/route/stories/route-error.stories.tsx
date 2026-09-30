import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ApiError } from '@/lib/errors';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { RouteError } from '../route-error';

const meta: Meta<typeof RouteError> = {
  title: 'Components/Route/RouteError',
  component: RouteError,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <StorybookRouter>
        <div className="bg-background p-6">
          <Story />
        </div>
      </StorybookRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RouteError>;

const standardError = new Error(
  'Failed to load entitlement: HTTP 500 (Internal Server Error)',
);

const longError = new Error(
  'Cannot deploy release: aggregate version mismatch. The release-management aggregate has been mutated by another process. Refresh the page or retry the deployment after the aggregate has been reconciled.',
);

// A failure the API explains: the card prints the `detail` of the problem, not
// the message of the `ApiError` (`Request failed with status 503`).
const apiProblem = new ApiError({
  status: 503,
  data: {
    title: 'Service Unavailable',
    status: 503,
    detail: 'Connector entitlement could not be verified. Please retry.',
    instance: '/api/connectors/attio/state',
    code: 'GetConnectorState.EntitlementVerificationUnavailable',
  },
});

// A failure the API did not answer itself: the body is a gateway's page, which
// the card does not print. It shows the generic message of the status instead.
const gatewayFailure = new ApiError({
  status: 502,
  data: '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>',
});

// A read the API refuses to a session that lacks a scope.
const missingScope = new ApiError({
  status: 403,
  data: {
    title: 'Forbidden',
    status: 403,
    detail: 'missing required scope: read:customers',
    instance: '/api/customers',
    code: 'Auth.MissingScope',
  },
});

export const Default: Story = {
  args: {
    error: standardError,
    reset: fn(),
  },
};

export const WithoutResetHandler: Story = {
  args: {
    error: standardError,
  },
};

export const LongMessage: Story = {
  args: {
    error: longError,
    reset: fn(),
  },
};

export const UnknownError: Story = {
  args: {
    error: new Error(''),
    reset: fn(),
  },
};

export const ApiProblem: Story = {
  args: {
    error: apiProblem,
    reset: fn(),
  },
};

export const GatewayFailure: Story = {
  args: {
    error: gatewayFailure,
    reset: fn(),
  },
};

export const RestrictedAccess: Story = {
  args: {
    error: missingScope,
  },
};

export const RestrictedAccessWithoutReason: Story = {
  args: {
    error: new ApiError({ status: 403, data: null }),
  },
};
