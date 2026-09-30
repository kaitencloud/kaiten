import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import '@/lib/i18n/config';
import type { PlainToken } from '../../../types';
import { TokenCreatedView } from '../token-created-view';

const token: PlainToken = {
  id: 'token-1',
  name: 'Production SDK',
  token: 'ksh_secret-value',
  scopes: ['read:feature_flags', 'write:instances'],
  createdAt: '2026-09-19T10:00:00.000Z',
  createdBy: { id: 'user-1', name: 'Splinter' },
};

describe('TokenCreatedView', () => {
  it('shows the token once, copies it, and leads back to the list', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const onDone = vi.fn();

    render(
      <TokenCreatedView
        token={token}
        serviceAccountName="SDK"
        onDone={onDone}
      />,
    );

    expect(
      screen.getByRole('textbox', { name: 'Production SDK' }),
    ).toHaveValue('ksh_secret-value');
    expect(screen.getByText('write:instances')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy token' }));
    expect(writeText).toHaveBeenCalledWith('ksh_secret-value');

    await user.click(
      screen.getByRole('button', { name: 'Back to Service Accounts' }),
    );
    expect(onDone).toHaveBeenCalled();
  });
});
