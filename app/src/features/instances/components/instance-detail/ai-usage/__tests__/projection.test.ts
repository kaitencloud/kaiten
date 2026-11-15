import { describe, expect, it } from 'vite-plus/test';
import { projectPool } from '../projection';

const WINDOW = {
  windowStart: '2026-11-01T00:00:00.000Z',
  windowEnd: '2026-12-01T00:00:00.000Z',
};
const NOW = Date.parse('2026-11-11T09:40:00.000Z');

describe('pool projection', () => {
  it('Acme Production: about 17,750 credits a day, included gone 15 Nov, maximum 16 Nov', () => {
    const projection = projectPool({
      consumed: 183_420.5,
      reserved: 1_250.5,
      limit: 250_000,
      maximum: 275_000,
      ...WINDOW,
      now: NOW,
    });

    expect(projection?.perDay).toBeCloseTo(17_752, 0);
    expect(projection?.included).toMatchObject({ kind: 'ON' });
    expect(projection?.included.kind === 'ON' && projection.included.at.slice(0, 10)).toBe('2026-11-15');
    expect(projection?.maximum?.kind === 'ON' && projection.maximum.at.slice(0, 10)).toBe('2026-11-16');
    expect(projection?.resetsAt).toBe('2026-12-01T00:00:00.000Z');
  });

  it('says when a threshold is already reached', () => {
    const projection = projectPool({ consumed: 509, reserved: 3, limit: 500, maximum: 500, ...WINDOW, now: NOW });

    expect(projection?.included).toEqual({ kind: 'REACHED' });
    expect(projection?.maximum).toBeNull();
  });

  it('says when the pace does not reach the limit before the reset', () => {
    const projection = projectPool({ consumed: 10, reserved: 0, limit: 5_000, maximum: 5_500, ...WINDOW, now: NOW });

    expect(projection?.included).toEqual({ kind: 'AFTER_RESET' });
    expect(projection?.maximum).toEqual({ kind: 'AFTER_RESET' });
  });

  it('gives none with too little data: less than a day elapsed, or nothing used', () => {
    expect(projectPool({ consumed: 100, reserved: 0, limit: 500, maximum: 500, ...WINDOW, now: Date.parse('2026-11-01T20:00:00.000Z') })).toBeNull();
    expect(projectPool({ consumed: 0, reserved: 0, limit: 500, maximum: 500, ...WINDOW, now: NOW })).toBeNull();
  });

  it('gives none for an unlimited or lifetime pool, or after the window', () => {
    expect(projectPool({ consumed: 10, reserved: 0, limit: -1, maximum: null, ...WINDOW, now: NOW })).toBeNull();
    expect(projectPool({ consumed: 10, reserved: 0, limit: 500, maximum: 500, now: NOW })).toBeNull();
    expect(projectPool({ consumed: 10, reserved: 0, limit: 500, maximum: 500, ...WINDOW, now: Date.parse('2026-12-02T00:00:00.000Z') })).toBeNull();
  });
});
