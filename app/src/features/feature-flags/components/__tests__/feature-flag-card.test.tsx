import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import type { FeatureFlag } from '@/api-client';
import { FeatureFlagCard } from '../feature-flag-card';

const mockToggle = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

vi.mock('../../hooks/use-toggle-feature-flag', () => ({
  useToggleFeatureFlag: () => ({ isPending: false, toggle: mockToggle }),
}));

vi.mock('../../hooks/use-feature-flag-card-store', () => ({
  useFeatureFlagCardStore: () => ({
    closeTryIt: vi.fn(),
    openTryIt: vi.fn(),
    tryItOpen: false,
  }),
}));

vi.mock('../try-it-dialog', () => ({ TryItDialog: () => null }));

const flag = {
  enabled: true,
  id: 'flag-1',
  name: 'IsKaiten',
  slug: 'is-kaiten',
  type: 'boolean',
} as FeatureFlag;

describe('FeatureFlagCard', () => {
  beforeEach(() => {
    mockToggle.mockReset();
  });

  it('asks before switching a flag and switches it only once confirmed', async () => {
    const user = userEvent.setup();

    render(<FeatureFlagCard flag={flag} />);

    await user.click(screen.getByRole('switch'));

    expect(
      screen.getByText('Pages.FeatureFlags.Card.confirmDisableTitle:IsKaiten'),
    ).toBeInTheDocument();
    expect(mockToggle).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Common.cancel' }));
    expect(mockToggle).not.toHaveBeenCalled();

    await user.click(screen.getByRole('switch'));
    await user.click(
      screen.getByRole('button', {
        name: 'Pages.FeatureFlags.Card.disableAction',
      }),
    );

    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle).toHaveBeenCalledWith(flag);
  });

  it('asks to enable a disabled flag', async () => {
    const user = userEvent.setup();

    render(<FeatureFlagCard flag={{ ...flag, enabled: false }} />);

    await user.click(screen.getByRole('switch'));

    expect(
      screen.getByText('Pages.FeatureFlags.Card.confirmEnableTitle:IsKaiten'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pages.FeatureFlags.Card.enableAction' }),
    ).toBeInTheDocument();
  });
});
