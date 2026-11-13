import { beforeEach, describe, expect, it } from 'vite-plus/test';
import type { AiInference, ConversionRule, Model } from '@/api-client';
import { createDevMockConfig } from '@/e2e/msw/dev-world';
import { createMockHandlers, undeclaredApiRequest } from '@/e2e/msw/handlers';
import { aiRuleId } from '../../e2e/app/_support/fixtures';
import { server } from './msw-server';

// What the mocks standing in for AI credits answer, read off the wire as the
// console reads them, over the world of `pnpm run dev:mock`: the codes and
// statuses of the API (api/internal/modules/models, licenses/*conversionrule*),
// writes that change what the next read sees, and the GraphQL documents.

const API = 'http://api.test/api';

const send = (method: string, path: string, body?: unknown) =>
  fetch(`${API}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  });
const json = async <T>(response: Response) => (await response.json()) as T;
const code = async (response: Response) =>
  (await json<{ code?: string }>(response)).code;
const graphql = async <T>(operationName: string, variables: object) =>
  (
    await json<{ data: T }>(
      await send('POST', '/graphql', {
        operationName,
        query: `query ${operationName} { __typename }`,
        variables,
      }),
    )
  ).data;

beforeEach(() => {
  server.use(
    ...createMockHandlers(createDevMockConfig(), 'off', undefined, true),
    undeclaredApiRequest,
  );
});

describe('AI credits, as the mocks serve them', () => {
  it('answers the capability and the platform flag on', async () => {
    expect(await json(await send('GET', '/ai/capabilities'))).toEqual({
      enabled: true,
    });
  });

  it('lists the models a page at a time, with one deprecated and one archived', async () => {
    const page = await json<{ hasMore: boolean; items: Model[]; nextCursor?: string }>(
      await send('GET', '/models?limit=10'),
    );
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    const rest = await json<{ items: Model[] }>(
      await send('GET', `/models?limit=10&cursor=${page.nextCursor}`),
    );
    const all = [...page.items, ...rest.items];
    expect(all).toHaveLength(13);
    expect(all.filter(({ status }) => status === 'DEPRECATED')).toHaveLength(1);
    expect(all.filter(({ status }) => status === 'ARCHIVED')).toHaveLength(1);
  });

  it('refuses a model in use, and a slug that is taken', async () => {
    const remove = await send('DELETE', '/models/claude-sonnet-4-5');
    expect(remove.status).toBe(409);
    expect(await code(remove)).toBe('DeleteModel.InUse');
    const taken = await send('POST', '/models', {
      modality: 'TEXT',
      name: 'Again',
      slug: 'gpt-5',
      status: 'ACTIVE',
      vendor: 'OpenAI',
    });
    expect(taken.status).toBe(409);
    expect(await code(taken)).toBe('CreateModel.SlugConflict');
  });

  it('creates, updates and archives a rule, each seen by the next read', async () => {
    const created = await send('POST', '/licenses/business/conversion-rules', {
      entitlementSlug: 'ai-credits',
      modelSlug: 'claude-haiku-4-5',
      rates: { perRequest: '0.5' },
      requestType: 'COMPLETION',
    });
    expect(created.status).toBe(201);
    const rule = await json<ConversionRule>(created);
    expect(rule.grantedByLicense).toBe(true);

    const again = await send('POST', '/licenses/business/conversion-rules', {
      entitlementSlug: 'ai-credits',
      modelSlug: 'claude-haiku-4-5',
      rates: { perRequest: '1' },
      requestType: 'COMPLETION',
    });
    expect(again.status).toBe(409);
    expect(await code(again)).toBe('CreateConversionRule.Conflict');

    const updated = await send(
      'PUT',
      `/licenses/business/conversion-rules/${rule.id}`,
      { rates: { perRequest: '0.75' } },
    );
    expect((await json<ConversionRule>(updated)).rates.perRequest).toBe('0.75');

    expect(
      (await send('DELETE', `/licenses/business/conversion-rules/${rule.id}`))
        .status,
    ).toBe(204);
    const active = await json<ConversionRule[]>(
      await send('GET', '/licenses/business/conversion-rules'),
    );
    expect(active.map(({ id }) => id)).not.toContain(rule.id);
  });

  it('refuses a rule for a deprecated model, and one with no rate', async () => {
    const deprecated = await send('POST', '/licenses/business/conversion-rules', {
      entitlementSlug: 'ai-credits',
      modelSlug: 'gpt-image-1',
      rates: { perUnit: '1' },
    });
    expect(await code(deprecated)).toBe('CreateConversionRule.ModelDeprecated');
    const unpriced = await send('POST', '/licenses/business/conversion-rules', {
      entitlementSlug: 'ai-credits',
      rates: {},
    });
    expect(unpriced.status).toBe(422);
  });

  it('marks a rule on a version that does not grant its pool', async () => {
    const rules = await json<ConversionRule[]>(
      await send('GET', '/licenses/enterprise/conversion-rules'),
    );
    const partner = rules.find(
      ({ entitlementSlug }) => entitlementSlug === 'partner-ai-credits',
    );
    expect(partner?.grantedByLicense).toBe(false);
  });

  it('serves the feed newest first, filtered by status and transaction', async () => {
    const feed = await json<{ items: AiInference[] }>(
      await send(
        'GET',
        '/instances/acme-production/entitlements/ai-credits/usage/inferences?status=COMMITTED',
      ),
    );
    const receipt = feed.items[0];
    expect(receipt.transactionId).toBe('txn_acme_003');
    expect(receipt.credits).toMatchObject({ charged: '1.38', computed: '1.38' });
    expect(receipt.conversionRuleId).toBe(aiRuleId(12));

    const one = await json<{ items: AiInference[] }>(
      await send(
        'GET',
        '/instances/acme-production/entitlements/ai-credits/usage/inferences?transactionId=txn_acme_016',
      ),
    );
    // Raised to the minimum of the rule.
    expect(one.items[0].credits).toMatchObject({ charged: '0.5', computed: '0.128' });
  });

  it('lists the open reservations only', async () => {
    const holds = await json<{ items: AiInference[] }>(
      await send(
        'GET',
        '/instances/acme-production/entitlements/ai-credits/usage/reservations',
      ),
    );
    expect(holds.items.map(({ status }) => status)).toEqual([
      'RESERVED',
      'RESERVED',
    ]);
  });

  it('serves the rate card a page at a time', async () => {
    const card = await graphql<{
      licenses: {
        hasMore: boolean;
        items: Array<{ conversionRules: ConversionRule[]; slug: string }>;
        nextCursor: string | null;
      };
    }>('AiRateCard', { limit: 4 });
    expect(card.licenses.items).toHaveLength(4);
    expect(card.licenses.hasMore).toBe(true);
    const all = [...card.licenses.items];
    let cursor = card.licenses.nextCursor;
    while (cursor) {
      const next = await graphql<typeof card>('AiRateCard', { cursor, limit: 4 });
      all.push(...next.licenses.items);
      cursor = next.licenses.nextCursor;
    }
    const enterprise = all.find(({ slug }) => slug === 'enterprise-v2');
    expect(
      enterprise?.conversionRules.every(({ status }) => status === 'ACTIVE'),
    ).toBe(true);
  });

  const FEED = '/instances/acme-production/entitlements/ai-credits/usage/inferences';
  const feed = async (query = '') =>
    (await json<{ items: AiInference[] }>(await send('GET', `${FEED}${query}`))).items;
  const ids = (rows: AiInference[]) => rows.map(({ transactionId }) => transactionId);

  it('filters the feed as the API does: authorization, model, request type', async () => {
    const refused = await feed('?authorized=false');
    expect(ids(refused)).toEqual(['txn_acme_008', 'txn_acme_009', 'txn_acme_011', 'txn_acme_018']);
    // A reservation is neither authorized nor refused.
    expect((await feed('?authorized=true')).map(({ status }) => status)).not.toContain('RESERVED');
    expect(ids(await feed('?model=mistral-large-2411'))).toEqual(['txn_acme_008']);
    expect(ids(await feed('?modelSlug=gpt-5&status=COMMITTED'))).toEqual(['txn_acme_014', 'txn_acme_017']);
    expect(ids(await feed('?requestType=AUDIO'))).toEqual(['txn_acme_009', 'txn_acme_013']);
  });

  it('hides a release that closed no reservation, unless asked for', async () => {
    expect(ids(await feed())).not.toContain('txn_acme_019');
    expect(ids(await feed('?status=RELEASED'))).toContain('txn_acme_019');
    const [tombstone] = await feed('?transactionId=txn_acme_019');
    expect(tombstone).toMatchObject({ status: 'RELEASED', warnings: ['NO_RESERVATION'] });
  });

  it('stores the snapshot, the licence, the journal sequence and both vendor costs on a commit', async () => {
    const [receipt] = await feed('?transactionId=txn_acme_003');
    expect(receipt).toMatchObject({
      licenseSlug: 'enterprise-v2',
      pricing: { ruleId: aiRuleId(12), specificity: 'EXACT_TYPED', minimumCreditsPerRequest: '0.5' },
      vendorCost: { computed: '0.01035', currency: 'USD', reported: '0.0118' },
    });
    expect(receipt.reportSeq).toEqual(expect.any(Number));
    // The rule of this one was edited after the commit: the snapshot keeps the old rates.
    const [edited] = await feed('?transactionId=txn_acme_004');
    const rule = await json<ConversionRule>(
      await send('GET', `/licenses/enterprise-v2/conversion-rules/${edited.conversionRuleId}`),
    );
    expect(edited.pricing?.rates.perOutputToken).toBe('0.0002');
    expect(rule.rates.perOutputToken).toBe('0.00025');
    // Rows older than snapshots have none.
    const [older] = await feed('?transactionId=txn_acme_014');
    expect(older.pricing).toBeUndefined();
  });

  const refund = (transactionId: string, body: object, key: string | null = 'key-1') =>
    fetch(`${API}${FEED}/${transactionId}/refund`, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      method: 'POST',
    });
  const consumed = async () =>
    (
      await json<Array<{ entitlementSlug: string; value: { value: number } }>>(
        await send('GET', '/instances/acme-production/entitlements/usage'),
      )
    ).find(({ entitlementSlug }) => entitlementSlug === 'ai-credits')?.value.value;

  it('refunds part of a charge, once per key, and gives the credits back to the pool', async () => {
    const [before] = await feed('?transactionId=txn_acme_017');
    expect(before.credits).toMatchObject({ charged: '78.5', refunded: '30' });
    expect(before.refunds).toHaveLength(1);
    const counter = await consumed();

    const first = await refund('txn_acme_017', { credits: '8.5', reason: 'goodwill' });
    expect(first.status).toBe(200);
    const created = await json<{ credits: string; id: string; reportSeq: number }>(first);
    expect(created.credits).toBe('8.5');
    const replay = await refund('txn_acme_017', { credits: '8.5', reason: 'goodwill' });
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect((await json<{ id: string }>(replay)).id).toBe(created.id);

    const [after] = await feed('?transactionId=txn_acme_017');
    expect(after.credits).toMatchObject({ charged: '78.5', refunded: '38.5' });
    expect(after.refunds.map(({ credits }) => credits)).toEqual(['30', '8.5']);
    expect(await consumed()).toBe(Math.round((counter! - 8.5) * 1e6) / 1e6);

    // With no amount, everything left goes back.
    const rest = await json<{ credits: string }>(await refund('txn_acme_017', {}, 'key-2'));
    expect(rest.credits).toBe('40');
  });

  it('refuses a refund with the codes of the API', async () => {
    const tooMuch = await refund('txn_acme_017', { credits: '48.6' });
    expect(tooMuch.status).toBe(409);
    const body = await json<{ code: string; errors: Array<{ value: string }> }>(tooMuch);
    expect(body.code).toBe('RefundAiInference.ExceedsRefundable');
    expect(body.errors[0].value).toBe('48.5');

    expect(await code(await refund('txn_acme_001', {}))).toBe('RefundAiInference.NotCommitted');
    expect(await code(await refund('txn_acme_019', {}))).toBe('RefundAiInference.NotCommitted');
    expect(await code(await refund('txn_acme_007', {}))).toBe('RefundAiInference.NothingToRefund');
    expect(await code(await refund('txn_nope', {}))).toBe('RefundAiInference.InferenceNotFound');
    expect(await code(await refund('txn_acme_017', {}, null))).toBe('RefundAiInference.IdempotencyKeyRequired');
    expect(await code(await refund('txn_acme_017', {}, 'not a key'))).toBe('RefundAiInference.InvalidIdempotencyKey');
    expect(await code(await refund('txn_acme_017', { credits: '-1' }))).toBe('RefundAiInference.InvalidAmount');
    expect(await code(await refund('txn_acme_017', { reason: '' }))).toBe('RefundAiInference.InvalidReason');

    await refund('txn_acme_017', { credits: '1' }, 'key-9');
    expect(await code(await refund('txn_acme_017', { credits: '2' }, 'key-9'))).toBe(
      'RefundAiInference.IdempotencyKeyReused',
    );
  });

  it('says who created and last changed a rule, and whether an add-on can grant its pool', async () => {
    const business = await json<ConversionRule[]>(await send('GET', '/licenses/business/conversion-rules'));
    const partner = business.find(({ entitlementSlug }) => entitlementSlug === 'partner-ai-credits');
    expect(partner).toMatchObject({ grantedByAddons: true, grantedByLicense: false });
    const enterprise = await json<ConversionRule[]>(await send('GET', '/licenses/enterprise/conversion-rules'));
    expect(
      enterprise.find(({ entitlementSlug }) => entitlementSlug === 'partner-ai-credits'),
    ).toMatchObject({ grantedByAddons: false, grantedByLicense: false });
    const edited = await json<ConversionRule>(
      await send('GET', `/licenses/enterprise-v2/conversion-rules/${aiRuleId(13)}`),
    );
    expect(edited.createdBy.name).not.toBe(edited.updatedBy.name);
  });

  it('names the version a family serves and numbers each version', async () => {
    const card = await graphql<{
      licenses: {
        items: Array<{
          family: { currentVersion: { slug: string } | null };
          slug: string;
          versionNumber: number;
        }>;
      };
    }>('AiRateCard', { limit: 50 });
    const starter = card.licenses.items.find(({ slug }) => slug === 'starter-v3');
    expect(starter).toMatchObject({ versionNumber: 3, family: { currentVersion: { slug: 'starter-v2' } } });
    expect(card).not.toHaveProperty('models');
  });

  it('lists what add-ons can grant on a family, the same for each of its versions', async () => {
    const grants = await graphql<{
      license: { addonGrants: Array<{ addonSlug: string; lifecycleState: string }> };
    }>('AiAddonGrants', { entitlementSlug: 'partner-ai-credits', licenseSlug: 'business' });
    expect(grants.license.addonGrants.map(({ addonSlug, lifecycleState }) => [addonSlug, lifecycleState])).toEqual([
      ['partner-credit-pack', 'ARCHIVED'],
      ['partner-credit-pack-v2', 'PUBLISHED'],
    ]);
    const none = await graphql<typeof grants>('AiAddonGrants', {
      entitlementSlug: 'partner-ai-credits',
      licenseSlug: 'enterprise',
    });
    expect(none.license.addonGrants).toEqual([]);
  });
});

describe('AI credits, in the variants of the mock world', () => {
  it('refuses the add-on grants where billing is off, and keeps the flag on the rules', async () => {
    server.use(
      ...createMockHandlers(createDevMockConfig({ aiBilling: 'off' }), 'off', undefined, true),
    );
    const refused = await send('POST', '/graphql', {
      operationName: 'AiAddonGrants',
      query: 'query AiAddonGrants { __typename }',
      variables: { licenseSlug: 'business' },
    });
    expect(refused.status).toBe(200);
    const body = await json<{ errors: Array<{ extensions: { code: string } }> }>(refused);
    expect(body.errors[0].extensions.code).toBe('Billing.Disabled');
    const rules = await json<ConversionRule[]>(await send('GET', '/licenses/business/conversion-rules'));
    expect(rules.some(({ grantedByAddons }) => grantedByAddons)).toBe(true);
  });

  it('serves a large catalogue: 45 active models or more, six vendors or more, four versions of a family', async () => {
    server.use(
      ...createMockHandlers(createDevMockConfig({ aiCatalogue: 'large' }), 'off', undefined, true),
    );
    const models = (await json<{ items: Model[] }>(await send('GET', '/models?limit=200'))).items;
    expect(models.filter(({ status }) => status === 'ACTIVE').length).toBeGreaterThanOrEqual(45);
    expect(new Set(models.map(({ vendor }) => vendor)).size).toBeGreaterThanOrEqual(6);
    const card = await graphql<{
      licenses: { items: Array<{ conversionRules: ConversionRule[]; family: { slug: string } }> };
    }>('AiRateCard', { limit: 50 });
    const enterprise = card.licenses.items.filter(({ family }) => family.slug === 'enterprise');
    expect(enterprise).toHaveLength(4);
    expect(enterprise.at(-1)?.conversionRules.length).toBeGreaterThan(30);
  });
});
