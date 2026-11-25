import { HttpResponse, http } from 'msw/http';
import { describe, expect, it, vi } from 'vite-plus/test';
import { server } from '@/__tests__/msw-server';
import { ApiError } from '@/lib/errors';
import {
  type PlatformFlagEvaluation,
  readAllPlatformFlags,
} from '@/lib/platform-flag-evaluations';
import { BetaFeaturesAppModel } from '../../../../../e2e/app/_support/model/beta-features-app-model';
import { betaFeaturesHandlers } from '@/e2e/msw/beta-features-handlers';
import { betaFeatureProblem, betaFeaturesOf, isInBeta } from '../beta-features';

const SOURCE = {
  baseUrl: 'http://platform.test/api',
  headers: async (): Promise<[string, string][]> => [
    ['Authorization', 'Bearer synthetic-read-only-token'],
  ],
  context: { targetingKey: 'org-beta-tests', organizationId: 'org-beta-tests' },
};

const { resolveSource } = vi.hoisted(() => ({
  resolveSource: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@/lib/feature-flag-source', () => ({
  BYPASS_AUTH: false,
  MOCKED_API: false,
  localSource: async () => null,
  platformSource: async () => null,
  usesPlatform: () => true,
  resolveSource,
}));

const evaluation = (
  overrides: Partial<PlatformFlagEvaluation>,
): PlatformFlagEvaluation => ({
  key: 'smart-search',
  type: 'boolean',
  value: false,
  variant: 'off',
  metadata: {},
  error: undefined,
  ...overrides,
});

const refused = (status: number | undefined, code?: string) =>
  new ApiError({ status, data: code ? { code, status } : null });

describe('betaFeaturesOf', () => {
  it('lists a public and an open beta, and no other flag', () => {
    const betas = betaFeaturesOf([
      evaluation({ key: 'public', metadata: { stage: 'public_beta' } }),
      evaluation({
        key: 'open',
        value: true,
        variant: 'on',
        metadata: { stage: 'open_beta' },
      }),
      evaluation({ key: 'private', metadata: { stage: 'private_beta' } }),
      evaluation({ key: 'released', value: true, variant: 'on' }),
      evaluation({ key: 'unknown-stage', metadata: { stage: 'beta' } }),
    ]);

    // By slug, whatever order the evaluation came in.
    expect(betas).toEqual([
      { flagSlug: 'open', stage: 'open_beta', enabled: true },
      { flagSlug: 'public', stage: 'public_beta', enabled: false },
    ]);
  });

  it('lists nothing when no flag is a beta, which is the case today', () => {
    expect(
      betaFeaturesOf([evaluation({ key: 'plan-billing', value: true })]),
    ).toEqual([]);
  });

  it('leaves out a beta the service reported in error', () => {
    expect(
      betaFeaturesOf([
        evaluation({
          type: undefined,
          value: undefined,
          variant: undefined,
          metadata: { stage: 'public_beta' },
          error: { code: 'PARSE_ERROR', details: undefined },
        }),
      ]),
    ).toEqual([]);
  });

  it('carries the metadata title and description, when they are non-empty strings', () => {
    expect(
      betaFeaturesOf([
        evaluation({
          key: 'with-copy',
          metadata: {
            stage: 'public_beta',
            title: 'Order forecast',
            description: 'Forecasts the next orders.',
          },
        }),
        evaluation({
          key: 'without-copy',
          metadata: { stage: 'public_beta', title: '  ', description: 3 },
        }),
      ]),
    ).toEqual([
      {
        flagSlug: 'with-copy',
        stage: 'public_beta',
        enabled: false,
        metadataTitle: 'Order forecast',
        metadataDescription: 'Forecasts the next orders.',
      },
      { flagSlug: 'without-copy', stage: 'public_beta', enabled: false },
    ]);
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

describe('readAllPlatformFlags', () => {
  it('reads every flag in one bulk request, as the source names the subject', async () => {
    resolveSource.mockResolvedValue(SOURCE);
    const requests: Request[] = [];
    server.use(
      http.post('http://platform.test/api/ofrep/v1/evaluate/flags', ({ request }) => {
        requests.push(request.clone());
        return HttpResponse.json({
          flags: [
            { key: 'gate', value: true, variant: 'on', reason: 'STATIC' },
            {
              key: 'checkout-flow',
              value: 'v2',
              variant: 'v2',
              reason: 'TARGETING_MATCH',
              metadata: {
                stage: 'public_beta',
                betaVariant: 'v2',
                'kaiten.brokenTargetingRules': ['a: b'],
              },
            },
            { key: 'limit', value: 3, variant: 'three', reason: 'STATIC' },
            { key: 'layout', value: { columns: 2 }, variant: 'wide' },
            {
              key: 'broken',
              errorCode: 'PARSE_ERROR',
              errorDetails: 'rule could not be parsed',
              metadata: { stage: 'public_beta' },
            },
            { value: true },
          ],
        });
      }),
    );

    const evaluations = await readAllPlatformFlags();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get('Authorization')).toBe(
      'Bearer synthetic-read-only-token',
    );
    expect(await requests[0]?.json()).toEqual({ context: SOURCE.context });
    expect(evaluations).toEqual([
      {
        key: 'gate',
        type: 'boolean',
        value: true,
        variant: 'on',
        metadata: {},
        error: undefined,
      },
      {
        key: 'checkout-flow',
        type: 'string',
        value: 'v2',
        variant: 'v2',
        metadata: { stage: 'public_beta', betaVariant: 'v2' },
        error: undefined,
      },
      {
        key: 'limit',
        type: 'number',
        value: 3,
        variant: 'three',
        metadata: {},
        error: undefined,
      },
      {
        key: 'layout',
        type: 'object',
        value: { columns: 2 },
        variant: 'wide',
        metadata: {},
        error: undefined,
      },
      {
        key: 'broken',
        type: undefined,
        value: undefined,
        variant: undefined,
        metadata: { stage: 'public_beta' },
        error: { code: 'PARSE_ERROR', details: 'rule could not be parsed' },
      },
    ]);
    expect(betaFeaturesOf(evaluations)).toEqual([
      { flagSlug: 'checkout-flow', stage: 'public_beta', enabled: true },
    ]);
  });

  it('answers the mocked service with the model, a flag the console never named included', async () => {
    resolveSource.mockResolvedValue(SOURCE);
    const model = new BetaFeaturesAppModel([
      { flagSlug: 'never-named', stage: 'public_beta', enabled: true },
    ]);
    server.use(...betaFeaturesHandlers(model, {}));

    expect(betaFeaturesOf(await readAllPlatformFlags())).toEqual([
      { flagSlug: 'never-named', stage: 'public_beta', enabled: true },
    ]);
  });

  it.each([304, 400, 401, 403, 429, 500])(
    'throws on a %i, rather than answering no flag',
    async (status) => {
      resolveSource.mockResolvedValue(SOURCE);
      server.use(
        http.post(
          'http://platform.test/api/ofrep/v1/evaluate/flags',
          () => new HttpResponse(null, { status }),
        ),
      );

      await expect(readAllPlatformFlags()).rejects.toThrow(String(status));
    },
  );

  it('throws on a 200 that carries no flags', async () => {
    resolveSource.mockResolvedValue(SOURCE);
    server.use(
      http.post('http://platform.test/api/ofrep/v1/evaluate/flags', () =>
        HttpResponse.json({ errorCode: 'GENERAL' }),
      ),
    );

    await expect(readAllPlatformFlags()).rejects.toThrow('no flags');
  });

  it('answers no flag, with no request, when there is no source', async () => {
    resolveSource.mockResolvedValue(null);
    const requests = vi.fn();
    server.use(
      http.post('*/ofrep/v1/evaluate/flags', () => {
        requests();
        return HttpResponse.json({ flags: [] });
      }),
    );

    expect(await readAllPlatformFlags()).toEqual([]);
    expect(requests).not.toHaveBeenCalled();
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
