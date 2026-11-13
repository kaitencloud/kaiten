import { describe, expect, it, vi } from 'vite-plus/test';
import { ApiError } from '@/lib/errors';
import { planSessionProblem, planSessionSupplier } from '../plan-session';

const refused = (status: number, code?: string) =>
  new ApiError({ status, data: code ? { code, status } : { status } });

// saas-api's answers to POST /plan/session, as the page explains them.
describe('planSessionProblem', () => {
  it('tells the organization without the page from the one not set up yet', () => {
    expect(planSessionProblem(refused(403, 'CreatePlanSession.NotEnabled'))).toBe(
      'not-enabled',
    );
    expect(
      planSessionProblem(refused(404, 'CreatePlanSession.NotProvisioned')),
    ).toBe('not-provisioned');
  });

  it('reads any other 403 as a caller who is not an administrator', () => {
    expect(planSessionProblem(refused(403, 'Auth.InsufficientScope'))).toBe(
      'forbidden',
    );
    expect(planSessionProblem(refused(403))).toBe('forbidden');
  });

  it('reads everything else as Kaiten Cloud being unavailable', () => {
    expect(planSessionProblem(refused(503, 'CreatePlanSession.Unavailable'))).toBe(
      'unavailable',
    );
    expect(planSessionProblem(refused(404))).toBe('unavailable');
    expect(planSessionProblem(new TypeError('Failed to fetch'))).toBe(
      'unavailable',
    );
  });
});

describe('planSessionSupplier', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const first = { token: 'kst_first', expiresAt: '2026-11-04T12:30:00Z' };
  const fresh = { token: 'kst_fresh', expiresAt: '2026-11-04T13:00:00Z' };

  it('hands out the session the page minted, once, then mints', async () => {
    const mint = vi.fn().mockResolvedValue(fresh);
    const supply = planSessionSupplier(first, mint, () => now);

    expect(await supply()).toEqual(first);
    expect(mint).not.toHaveBeenCalled();
    expect(await supply()).toEqual(fresh);
    expect(mint).toHaveBeenCalledOnce();
  });

  it('does not hand out a first session with a minute or less left', async () => {
    const mint = vi.fn().mockResolvedValue(fresh);
    const nearlyOver = { ...first, expiresAt: '2026-11-04T12:00:59Z' };

    expect(await planSessionSupplier(nearlyOver, mint, () => now)()).toEqual(fresh);
    expect(mint).toHaveBeenCalledOnce();
  });
});
