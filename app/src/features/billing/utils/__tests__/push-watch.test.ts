import { describe, expect, it } from 'vite-plus/test';
import type { Invoice } from '@/api-client';
import {
  getPushPollDelay,
  hasPushSettled,
  PUSH_POLL_INTERVAL_MS,
  PUSH_POLL_WINDOW_MS,
  startPushWatch,
} from '../push-watch';

type Pushed = Pick<Invoice, 'provider' | 'status'>;

const waiting = (attempts = 1): Pushed => ({
  provider: {
    nextPushAt: '2027-03-01T00:00:00Z',
    pushAttempts: attempts,
  },
  status: 'DRAFT',
});

describe('the push a person asked for', () => {
  it('starts from the attempts the invoice had, and from now', () => {
    expect(startPushWatch(waiting(3), 1_000)).toEqual({
      attempts: 3,
      startedAt: 1_000,
    });
    expect(startPushWatch({}, 5)).toEqual({ attempts: 0, startedAt: 5 });
  });

  it('has not had its turn while the invoice waits in the queue', () => {
    const watch = startPushWatch(waiting(1), 0);

    expect(hasPushSettled(waiting(1), watch)).toBe(false);
    expect(
      hasPushSettled(
        { provider: { pushAttempts: 1 }, status: 'PUSH_FAILED' },
        watch,
      ),
    ).toBe(false);
  });

  it('has had it once the invoice is pushed, or went on to any other status', () => {
    const watch = startPushWatch(waiting(1), 0);

    for (const status of ['PUSHED', 'PAID', 'VOID', 'PAYMENT_FAILED'] as const) {
      expect(hasPushSettled({ provider: { pushAttempts: 2 }, status }, watch)).toBe(
        true,
      );
    }
  });

  it('has had it once the provider holds the draft for a person to finalize', () => {
    const watch = startPushWatch(waiting(0), 0);

    expect(
      hasPushSettled(
        { provider: { externalInvoiceId: 'in_1', pushAttempts: 1 }, status: 'DRAFT' },
        watch,
      ),
    ).toBe(true);
  });

  it('has had it once the push ran and failed again, one more attempt being counted', () => {
    const watch = startPushWatch(
      { provider: { pushAttempts: 2 } },
      0,
    );

    expect(
      hasPushSettled(
        { provider: { pushAttempts: 3 }, status: 'PUSH_FAILED' },
        watch,
      ),
    ).toBe(true);
  });
});

describe('when the invoice is read again', () => {
  const watch = startPushWatch(waiting(1), 0);

  it('is every five seconds while the push has not had its turn', () => {
    expect(PUSH_POLL_INTERVAL_MS).toBe(5_000);
    expect(getPushPollDelay(waiting(1), watch, 1_000)).toBe(5_000);
  });

  it('is never when nothing was asked, or nothing is known of the invoice', () => {
    expect(getPushPollDelay(waiting(1), null, 1_000)).toBe(false);
    expect(getPushPollDelay(undefined, watch, 1_000)).toBe(false);
  });

  it('stops once the push has had its turn', () => {
    expect(
      getPushPollDelay({ provider: { pushAttempts: 2 }, status: 'PUSHED' }, watch, 1_000),
    ).toBe(false);
  });

  it('stops after two minutes, whatever the invoice says', () => {
    expect(PUSH_POLL_WINDOW_MS).toBe(120_000);
    expect(getPushPollDelay(waiting(1), watch, PUSH_POLL_WINDOW_MS - 1)).toBe(
      5_000,
    );
    expect(getPushPollDelay(waiting(1), watch, PUSH_POLL_WINDOW_MS)).toBe(false);
  });
});
