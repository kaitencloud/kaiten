import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vite-plus/test';
import { useFocusLeave } from '../use-focus-leave';

function Control({ onLeave }: { onLeave: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const leave = useFocusLeave({
    containers: () => [root.current, popup.current],
    onLeave,
  });

  return (
    <>
      <div
        data-testid="root"
        onBlur={leave.onBlur}
        onFocus={leave.onFocus}
        ref={root}
      >
        <button type="button">First</button>
        <button type="button">Second</button>
      </div>
      {/* Elsewhere in the DOM, as a portaled popup is, but part of the control. */}
      <div ref={popup}>
        <button type="button">Popup</button>
      </div>
      <button type="button">Outside</button>
    </>
  );
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('useFocusLeave', () => {
  it('says nothing as the focus moves from one part of the control to another', async () => {
    const onLeave = vi.fn();
    render(<Control onLeave={onLeave} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.tab();
    await wait();

    expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('says nothing as the focus goes to an element of the control that sits elsewhere', async () => {
    const onLeave = vi.fn();
    render(<Control onLeave={onLeave} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'First' }));
    screen.getByRole('button', { name: 'Popup' }).focus();
    await wait();

    expect(onLeave).not.toHaveBeenCalled();
  });

  it('says once that the focus left, as it goes to an element outside the control', async () => {
    const onLeave = vi.fn();
    render(<Control onLeave={onLeave} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));

    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    await wait();

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('says it again after the focus came back and left once more', async () => {
    const onLeave = vi.fn();
    render(<Control onLeave={onLeave} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Second' }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));

    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(2));
  });

  it('says nothing for a focus that never entered the control', async () => {
    const onLeave = vi.fn();
    render(<Control onLeave={onLeave} />);

    screen.getByRole('button', { name: 'Outside' }).focus();
    screen.getByRole('button', { name: 'Outside' }).blur();
    await wait();

    expect(onLeave).not.toHaveBeenCalled();
  });
});
