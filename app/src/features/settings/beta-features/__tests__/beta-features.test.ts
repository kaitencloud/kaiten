import { OpenFeature } from '@openfeature/web-sdk';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { ApiError } from '@/lib/errors';
import {
  type PlatformFlagEvaluation,
  readPlatformFlags,
  refreshPlatformFlags,
} from '@/lib/feature-flags';
import { BetaFeaturesAppModel } from '../../../../../e2e/app/_support/model/beta-features-app-model';
import { betaFeaturesHandlers } from '@/e2e/msw/beta-features-handlers';
import { betaFeatureProblem, betaFeaturesOf, isInBeta } from '../beta-features';

vi.mock('@/lib/feature-flag-source', () => ({
  BYPASS_AUTH: false,
  MOCKED_API: false,
  localSource: async () => null,
  platformSource: async () => null,
  usesPlatform: () => true,
  resolveSource: async () => ({
    baseUrl: 'http://platform.test/api',
    headers: async () => [],
    context: { targetingKey: 'org-beta-tests' },
  }),
}));

const evaluation = (
  overrides: Partial<PlatformFlagEvaluation>,
): PlatformFlagEvaluation => ({
  flag: 'smart-search',
  type: 'boolean',
  value: false,
  variant: 'off',
  metadata: {},
  errorCode: undefined,
  ...overrides,
});

const refused = (status: number | undefined, code?: string) =>
  new ApiError({ status, data: code ? { code, status } : null });

describe('betaFeaturesOf', () => {
  it('lists a public and an open beta, and no other flag', () => {
    const betas = betaFeaturesOf([
      evaluation({ flag: 'public', metadata: { stage: 'public_beta' } }),
      evaluation({
        flag: 'open',
        value: true,
        variant: 'on',
        metadata: { stage: 'open_beta' },
      }),
      evaluation({ flag: 'private', metadata: { stage: 'private_beta' } }),
      evaluation({ flag: 'released', value: true, variant: 'on' }),
      evaluation({ flag: 'unknown-stage', metadata: { stage: 'beta' } }),
    ]);

    expect(betas).toEqual([
      { flagSlug: 'public', stage: 'public_beta', enabled: false },
      { flagSlug: 'open', stage: 'open_beta', enabled: true },
    ]);
  });

  it('lists nothing when no flag is a beta, which is the case today', () => {
    expect(
      betaFeaturesOf([evaluation({ flag: 'plan-billing', value: true })]),
    ).toEqual([]);
  });

  it('leaves out a beta the provider could not evaluate as declared', () => {
    expect(
      betaFeaturesOf([
        evaluation({
          metadata: { stage: 'public_beta' },
          errorCode: 'TYPE_MISMATCH',
        }),
      ]),
    ).toEqual([]);
  });
});

describe('isInBeta', () => {
  it('reads a boolean flag by its value', () => {
    expect(isInBeta(evaluation({ value: true, variant: 'on' }))).toBe(true);
    expect(isInBeta(evaluation({ value: false, variant: 'off' }))).toBe(false);
  });

  it('reads any other flag by the variant its metadata names betaVariant', () => {
    const served = (variant: string, betaVariant?: string) =>
      evaluation({
        type: 'string',
        value: variant,
        variant,
        metadata: betaVariant ? { stage: 'public_beta', betaVariant } : {},
      });

    expect(isInBeta(served('v2', 'v2'))).toBe(true);
    expect(isInBeta(served('legacy', 'v2'))).toBe(false);
    // Nothing says which variant is the beta: never on.
    expect(isInBeta(served('v2'))).toBe(false);
  });
});

describe('a non-boolean beta, through the OFREP provider', () => {
  beforeEach(() => refreshPlatformFlags(new QueryClient()));
  afterEach(() => OpenFeature.clearProviders());

  it('is on when the variant served is its betaVariant', async () => {
    const model = new BetaFeaturesAppModel([
      {
        flagSlug: 'checkout-flow',
        stage: 'public_beta',
        enabled: true,
        betaVariant: 'v2',
        stableVariant: 'legacy',
      },
    ]);
    server.use(...betaFeaturesHandlers(model, {}));

    const evaluations = await readPlatformFlags({ 'checkout-flow': 'string' });

    expect(evaluations[0]).toMatchObject({
      flag: 'checkout-flow',
      value: 'v2',
      variant: 'v2',
      metadata: { stage: 'public_beta', betaVariant: 'v2' },
    });
    expect(betaFeaturesOf(evaluations)).toEqual([
      { flagSlug: 'checkout-flow', stage: 'public_beta', enabled: true },
    ]);
  });
});

describe('betaFeatureProblem', () => {
  it.each([
    [400, 'SetBetaFeature.InvalidBody', 'invalid-body'],
    [403, 'RequireScope.MissingScope', 'missing-scope'],
    [403, 'SetBetaFeature.NotToggleable', 'not-toggleable'],
    [404, 'SetBetaFeature.NotProvisioned', 'not-provisioned'],
    [409, 'SetBetaFeature.NotAccepted', 'not-accepted'],
    [503, 'SetBetaFeature.Unavailable', 'unavailable'],
  ])('reads %i %s as %s', (status, code, problem) => {
    expect(betaFeatureProblem(refused(status, code))).toBe(problem);
  });

  it('reads another 403 as a missing scope', () => {
    expect(betaFeatureProblem(refused(403, 'Auth.MissingScope'))).toBe(
      'missing-scope',
    );
  });

  it('reads no answer and a gateway failure as unavailable', () => {
    expect(betaFeatureProblem(refused(undefined))).toBe('unavailable');
    expect(betaFeatureProblem(refused(502))).toBe('unavailable');
  });

  it('reads anything else as unexpected', () => {
    expect(betaFeatureProblem(refused(404))).toBe('unexpected');
    expect(betaFeatureProblem(new Error('boom'))).toBe('unexpected');
  });
});
