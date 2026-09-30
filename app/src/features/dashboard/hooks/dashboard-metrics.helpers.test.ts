import { describe, expect, it } from 'vite-plus/test';
import type { Token } from '@/api-client';
import {
  buildMonthlySeries,
  classifyTokenState,
  getDaysUntil,
  toDate,
} from './dashboard-metrics.helpers';

const token = (overrides: Partial<Token> = {}): Token =>
  ({
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt: null,
    id: 'token-1',
    name: 'Automation',
    revokedAt: null,
    ...overrides,
  }) as Token;

describe('dashboard metric helpers', () => {
  it('parses valid dates and rejects invalid values', () => {
    expect(toDate('2026-06-11T10:00:00Z')).toBeInstanceOf(Date);
    expect(toDate('not-a-date')).toBeNull();
    expect(toDate(null)).toBeNull();
  });

  it('builds a gap-free monthly series', () => {
    const january = new Date(2026, 0, 1);
    const march = new Date(2026, 2, 1);
    const series = buildMonthlySeries(
      [january, march],
      new Map([
        [
          january.getTime(),
          { created: 2, ending: 0, started: 1 },
        ],
        [
          march.getTime(),
          { created: 1, ending: 1, started: 0 },
        ],
      ]),
    );

    expect(series).toHaveLength(3);
    expect(series[1]).toMatchObject({
      created: 0,
      ending: 0,
      started: 0,
    });
  });

  it('classifies every token security state', () => {
    const now = new Date('2026-06-11T00:00:00Z');

    expect(classifyTokenState(token({ revokedAt: '2026-06-01' }), now)).toBe(
      'revoked',
    );
    expect(classifyTokenState(token(), now)).toBe('noExpiry');
    expect(
      classifyTokenState(token({ expiresAt: '2026-06-10T00:00:00Z' }), now),
    ).toBe('expired');
    expect(
      classifyTokenState(token({ expiresAt: '2026-06-20T00:00:00Z' }), now),
    ).toBe('expiringSoon');
    expect(
      classifyTokenState(token({ expiresAt: '2026-08-20T00:00:00Z' }), now),
    ).toBe('healthy');
  });

  it('rounds remaining partial days up', () => {
    expect(
      getDaysUntil(
        new Date('2026-06-12T01:00:00Z'),
        new Date('2026-06-11T12:00:00Z'),
      ),
    ).toBe(1);
  });
});
