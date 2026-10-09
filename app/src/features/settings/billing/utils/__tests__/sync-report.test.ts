import { describe, expect, it } from 'vite-plus/test';
import type { Outcome } from '@/api-client';
import { summarizeSyncReport } from '../sync-report';

const outcome = (overrides: Partial<Outcome>): Outcome => ({
  applied: 0,
  failed: 0,
  providerKind: 'STRIPE',
  status: 'SUCCESS',
  syncedAt: '2027-03-01T10:00:00Z',
  ...overrides,
});

describe('how a pass of the payment providers went', () => {
  it('is done when every provider was read, with how many invoices changed', () => {
    expect(
      summarizeSyncReport({ providers: [outcome({ applied: 3 })] }),
    ).toEqual({ applied: 3, kind: 'done' });
  });

  it('is done with nothing changed when the provider had nothing new', () => {
    expect(summarizeSyncReport({ providers: [outcome({})] })).toEqual({
      applied: 0,
      kind: 'done',
    });
  });

  it('is partial when invoices could not be applied, with the words of the API', () => {
    expect(
      summarizeSyncReport({
        providers: [
          outcome({
            applied: 2,
            error: 'could not apply in_1, in_2',
            failed: 2,
            status: 'PARTIAL',
          }),
        ],
      }),
    ).toEqual({
      applied: 2,
      error: 'could not apply in_1, in_2',
      kind: 'partial',
    });
  });

  it('is failed when no provider could be read', () => {
    expect(
      summarizeSyncReport({
        providers: [
          outcome({
            error: 'the payment provider could not be reached',
            status: 'FAILED',
          }),
        ],
      }),
    ).toEqual({
      error: 'the payment provider could not be reached',
      kind: 'failed',
    });
  });

  it('is partial when one provider failed and another did not', () => {
    expect(
      summarizeSyncReport({
        providers: [
          outcome({ applied: 1 }),
          outcome({ error: 'unreachable', status: 'FAILED' }),
        ],
      }),
    ).toMatchObject({ applied: 1, error: 'unreachable', kind: 'partial' });
  });
});
