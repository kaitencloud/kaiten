import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { DeploymentZone, Release } from '@/api-client';
import { DeployReleaseDialog } from '../deploy-release-dialog';

const mockMutateAsync = vi.fn();

vi.mock('../../../hooks/use-deploy-release-mutation', () => ({
  useDeployReleaseMutation: () => ({
    isPending: false,
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { zone?: string }) =>
      typeof options === 'object' && options?.zone
        ? `${key}:${options.zone}`
        : key,
  }),
}));

// Select relies on pointer capture and scrollIntoView, which jsdom lacks.
Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

const releases = [
  { id: 'release-1', version: 'v1.4.0' },
  { id: 'release-2', version: 'v1.5.0' },
] as Release[];

const zone = {
  description: 'EU production',
  metadata: {},
  name: 'Production EU',
  slug: 'production-eu',
  type: 'PRODUCTION',
} as DeploymentZone;

describe('DeployReleaseDialog', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset().mockResolvedValue(undefined);
  });

  it('keeps Deploy disabled until a release is picked on an empty zone', async () => {
    const user = userEvent.setup();

    render(
      <DeployReleaseDialog
        deploymentZone={zone}
        releases={releases}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Features.Releases.Form.deployToZone:Production EU',
      }),
    ).toBeInTheDocument();
    const deployButton = screen.getByRole('button', {
      name: 'Features.Releases.Actions.deploy',
    });
    expect(deployButton).toBeDisabled();

    screen.getByRole('combobox').focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option', { name: 'v1.5.0' }));

    expect(deployButton).toBeEnabled();
    await user.click(deployButton);

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ releaseId: 'release-2' }),
        path: { deploymentZoneSlug: 'production-eu' },
      }),
    );
  });

  it('opens on the running release and offers only releases, never a way to undeploy', async () => {
    const user = userEvent.setup();

    render(
      <DeployReleaseDialog
        deploymentZone={{ ...zone, releaseId: 'release-1' }}
        releases={releases}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('v1.4.0');
    const deployButton = screen.getByRole('button', {
      name: 'Features.Releases.Actions.deploy',
    });
    expect(deployButton).toBeDisabled();

    // The API reads an omitted `releaseId` as "keep the current release", so
    // the list holds the releases and nothing else: no entry could take the
    // zone off its release.
    await user.click(screen.getByRole('combobox'));
    expect(
      (await screen.findAllByRole('option')).map((option) => option.textContent),
    ).toEqual(['v1.4.0', 'v1.5.0']);

    await user.click(screen.getByRole('option', { name: 'v1.5.0' }));
    expect(deployButton).toBeEnabled();
    await user.click(deployButton);

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ releaseId: 'release-2' }),
        path: { deploymentZoneSlug: 'production-eu' },
      }),
    );
  });
});
