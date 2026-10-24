import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { useLeaveRestrictedDialog } from '../use-leave-restricted-dialog';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const refused = { allowed: false, isPending: false };

describe('useLeaveRestrictedDialog', () => {
  beforeEach(() => {
    toast.error.mockReset();
  });

  it('says the session may not and leaves, once, when the address of a dialog it may not use is opened', () => {
    const leave = vi.fn();
    const { rerender } = renderHook(() =>
      useLeaveRestrictedDialog(refused, leave),
    );
    rerender();

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Errors.restrictedAction', {
      id: 'restricted-action',
    });
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('leaves through the latest close it was given', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(
      ({ access, leave }) => useLeaveRestrictedDialog(access, leave),
      { initialProps: { access: { allowed: false, isPending: true }, leave: first } },
    );
    rerender({ access: { allowed: false, isPending: true }, leave: latest });
    rerender({ access: refused, leave: latest });

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a session that may', () => {
    const leave = vi.fn();
    renderHook(() =>
      useLeaveRestrictedDialog({ allowed: true, isPending: false }, leave),
    );

    expect(toast.error).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it('waits for the token to be read before it says anything', () => {
    const leave = vi.fn();
    const { rerender } = renderHook(
      ({ access }) => useLeaveRestrictedDialog(access, leave),
      { initialProps: { access: { allowed: false, isPending: true } } },
    );
    expect(leave).not.toHaveBeenCalled();

    rerender({ access: refused });

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the dialog is not asked for', () => {
    const leave = vi.fn();
    renderHook(() => useLeaveRestrictedDialog(refused, leave, false));

    expect(toast.error).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });
});
