import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { formRecoveryCollectionExists } from '@/lib/form-recovery';
import {
  elapse,
  input,
  installRecoveryTranslations,
  mountDemo,
  setupUser,
} from './recovery-test-utils';
import { storedRecords } from './session-helpers';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: toastMock }));

beforeEach(() => {
  installRecoveryTranslations();
  toastMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-23T10:00:00.000Z'));
  vi.stubEnv('VITE_E2E_BYPASS_AUTH', 'true');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const only = () => Object.values(storedRecords());

/** The alerts of the module; the live region of the announcer is always there. */
const alerts = () =>
  Array.from(document.querySelectorAll('[data-slot="alert"]'));

/** Fills the two steps, as a person who then closes the tab. */
async function fillAndLeave(user: ReturnType<typeof setupUser>) {
  const view = mountDemo();
  await user.type(input('Name'), 'Gold');
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await user.type(input('Count'), '12');
  await user.type(input('Note'), 'for sales');
  await user.type(input('Secret'), 'hunter2');
  await elapse();
  view.unmount();
}

describe('a form that uses the recovery', () => {
  it('moves to the next step with "Next" without sending, and sends with "Send"', async () => {
    const user = setupUser();
    const request = vi.fn().mockResolvedValue({});
    mountDemo({ request });

    await user.type(input('Name'), 'Gold');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await elapse(300);

    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');

    await user.type(input('Count'), '12');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('writes nothing and shows nothing while the person has typed nothing', async () => {
    const user = setupUser();
    mountDemo();
    await elapse(3_000);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await elapse(3_000);

    expect(only()).toEqual([]);
    expect(alerts()).toHaveLength(0);
  });

  it('keeps what was typed less than a second before the page went away', async () => {
    const user = setupUser();
    const view = mountDemo();
    await user.type(input('Name'), 'Gold');
    expect(only()).toEqual([]);

    view.unmount();

    expect(only()[0]).toMatchObject({ kind: 'entry', payload: '[["name","Gold"]]' });
  });

  it('keeps what was typed less than a second before pagehide', async () => {
    const user = setupUser();
    mountDemo();
    await user.type(input('Name'), 'Gold');

    window.dispatchEvent(new Event('pagehide'));

    expect(only()[0]).toMatchObject({ kind: 'entry', payload: '[["name","Gold"]]' });
  });

  it('offers the input on the next visit, and restores values, step and focus on "Resume"', async () => {
    const user = setupUser();
    await fillAndLeave(user);

    mountDemo();
    await screen.findByText('Pick up where you left off?');
    const [alert] = alerts();
    expect(alert).toHaveTextContent('at step 2 of 2 (Details)');
    // The blank form is under the alert, usable.
    expect(input('Name')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(await screen.findByLabelText('Count')).toHaveValue('12');
    expect(input('Note')).toHaveValue('for sales');
    expect(screen.queryByText('Pick up where you left off?')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(document.body).not.toBe(document.activeElement);
  });

  it('never stores a secret, reminds of it after "Resume", and lets go of the reminder once it is entered', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    expect(JSON.stringify(window.localStorage)).not.toContain('hunter2');

    mountDemo();
    expect(await screen.findByText(/Secret/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));

    const reminder = await screen.findByText(/this field is never kept: Secret/);
    expect(input('Secret')).toHaveValue('');

    await user.type(input('Secret'), 'again');
    await waitFor(() => expect(reminder).not.toBeInTheDocument());
    await elapse();
    expect(JSON.stringify(window.localStorage)).not.toContain('again');
  });

  it('does not submit the form when a button of the alert is pressed', async () => {
    const user = setupUser();
    const request = vi.fn().mockResolvedValue({});
    await fillAndLeave(user);

    mountDemo({ request });
    await user.click(await screen.findByRole('button', { name: 'Resume' }));

    expect(request).not.toHaveBeenCalled();
  });

  it('uses statuses, never alerts, and leaves the alert unmounted when there is nothing to say', async () => {
    const user = setupUser();
    const blank = mountDemo();
    expect(alerts()).toHaveLength(0);
    blank.unmount();
    await fillAndLeave(user);

    mountDemo();
    await screen.findByText('Pick up where you left off?');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(alerts().every((node) => node.getAttribute('role') === 'status')).toBe(true);
  });

  it('announces the restore to a screen reader', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    mountDemo();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));

    await waitFor(() =>
      expect(
        screen.getAllByRole('status').some((node) =>
          node.textContent === 'Entries restored, step 2 of 2 (Details).',
        ),
      ).toBe(true),
    );
  });

  it('does not offer a form that was sent', async () => {
    const user = setupUser();
    const view = mountDemo();
    await user.type(input('Name'), 'Gold');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sent')).toBeInTheDocument();
    view.unmount();
    await elapse(3_000);

    mountDemo();
    await elapse();

    expect(screen.queryByText('Pick up where you left off?')).not.toBeInTheDocument();
    expect(only().map((record) => record.kind)).toEqual(['tombstone']);
  });

  it('keeps the input after a refusal, as an ordinary resume', async () => {
    const user = setupUser();
    const request = vi.fn().mockRejectedValue(new ApiError({ status: 422, data: null }));
    const view = mountDemo({ request });
    await user.type(input('Name'), 'Gold');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    view.unmount();

    mountDemo();
    const alert = await screen.findByText('Pick up where you left off?');
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText('Your last submission may have gone through')).not.toBeInTheDocument();
  });

  it('warns above the button after an answer that never came, and again on the next visit', async () => {
    const user = setupUser();
    const request = vi.fn().mockRejectedValue(new ApiError({ status: 503, data: null }));
    const view = mountDemo({ request });
    await user.type(input('Name'), 'Gold');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText(/The last submission got no answer and may have gone through/),
    ).toBeInTheDocument();
    view.unmount();

    mountDemo();
    expect(await screen.findByText('Your last submission may have gone through')).toBeInTheDocument();
    const link = screen.getAllByRole('link', { name: 'View the list' })[0];
    expect(link).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume anyway' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard these entries' })).toBeInTheDocument();
  });

  it('starts over: the form stays blank, a toast offers an undo, and the new input is its own', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    mountDemo();
    await user.click(await screen.findByRole('button', { name: 'Start over' }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));
    expect(toastMock.mock.calls[0]![0]).toBe('Previous entries discarded');
    expect(toastMock.mock.calls[0]![1]).toMatchObject({ duration: 8_000, action: { label: 'Undo' } });
    expect(screen.queryByText('Pick up where you left off?')).not.toBeInTheDocument();
    expect(input('Name')).toHaveValue('');

    await user.type(input('Name'), 'Silver');
    await elapse();
    expect(only().filter((record) => record.kind === 'entry')).toHaveLength(1);
  });

  it('shrinks the offer to a line when the person types without answering', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    mountDemo();
    await screen.findByText('Pick up where you left off?');

    await user.type(input('Name'), 'S');

    expect(await screen.findByText(/Earlier entries .* are still kept/)).toBeInTheDocument();
    expect(screen.queryByText('Pick up where you left off?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bring them back' })).toBeInTheDocument();
  });

  it('cancels with an undo that brings back the form, restored without an offer', async () => {
    const user = setupUser();
    const onCancel = vi.fn();
    const view = mountDemo({ onCancel });
    await user.type(input('Name'), 'Gold');
    await elapse();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(only()[0]).toMatchObject({ kind: 'tombstone', reason: 'discarded' });
    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    expect(toastMock.mock.calls[0]![0]).toBe('Entries discarded');

    view.unmount();
    act(() => toastMock.mock.calls[0]![1].action.onClick());
    mountDemo();

    expect(await screen.findByLabelText('Name')).toHaveValue('Gold');
    expect(screen.queryByText('Pick up where you left off?')).not.toBeInTheDocument();
  });
});

describe('a form that does not use it', () => {
  it('reads nothing, writes nothing and does not even create the collection', async () => {
    const user = setupUser();
    mountDemo({ enabled: false });

    await user.type(input('Name'), 'Gold');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await elapse(3_000);

    expect(window.localStorage).toHaveLength(0);
    expect(formRecoveryCollectionExists()).toBe(false);
  });

  it('sends as it always did', async () => {
    const user = setupUser();
    const request = vi.fn().mockResolvedValue({});
    mountDemo({ enabled: false, request });

    await user.type(input('Name'), 'Gold');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Sent')).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('React', () => {
  it('works under StrictMode: one offer, nothing written for an untouched form, no warning', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    mountDemo({}, { strict: true });
    await screen.findByText('Pick up where you left off?');
    expect(screen.getAllByText('Pick up where you left off?')).toHaveLength(1);
    const before = only()[0]!;

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await elapse();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await elapse(3_000);

    // Adopting writes once; nothing after it, and nothing of the input is lost.
    expect(error).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(only()[0]).toMatchObject({
      kind: 'entry',
      payload: before.payload,
      omittedFilled: ['secret'],
    });
  });

  it('does not warn about a state update during a render when it restores', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    mountDemo();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    await elapse(300);

    const warned = error.mock.calls.some((call) =>
      String(call[0]).includes('Cannot update a component'),
    );
    expect(warned).toBe(false);
  });

  it('enables the submit button and marks the form as changed after a restore', async () => {
    const user = setupUser();
    await fillAndLeave(user);
    mountDemo();
    await user.click(await screen.findByRole('button', { name: 'Resume' }));

    expect(await screen.findByRole('button', { name: 'Send' })).toBeEnabled();
  });
});

