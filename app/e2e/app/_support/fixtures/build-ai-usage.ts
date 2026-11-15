import type {
  AiInference,
  AiInferencePricing,
  AiInferenceRefund,
  AiUsage,
  ConversionRule,
  EntitlementUsage,
  LicenseEntitlement,
  Model,
} from '@/api-client';
import {
  type AiRequestStatus,
  priceUsage,
  resolveRule,
  specificityOf,
  vendorCost,
} from '@/domains/ai-credits/pricing';
import { identityProvenance } from '../model/effective-entitlement';
import { AI_POOL, PARTNER_POOL } from './build-ai-catalogue';

/** An inference of the mocks, filed under the instance and pool it was reported on. */
export type AiInferenceRecord = AiInference & {
  entitlementSlug: string;
  instanceSlug: string;
};

/**
 * What each instance has used of each pool, `[consumed, reserved]`: Acme
 * Production as in the mockups, Globex Production near its limit, Globex
 * Staging past its hard limit (overdrawn) and Beta Staging on a version that
 * grants credits and prices none. Only the instances with a feed below hold
 * reservations, and what they report as reserved is the sum of their open holds.
 */
export const AI_USAGE: Record<string, Record<string, [number, number]>> = {
  'acme-production': { [AI_POOL]: [183_420.5, 1_250.5] },
  // The partner pool warns at 90 %: at 86 % of its 20,000 it is not near its limit yet.
  'acme-us': { [AI_POOL]: [12_000, 0], [PARTNER_POOL]: [17_200, 0] },
  'acme-legacy': { [AI_POOL]: [61_800, 0] },
  'beta-staging': { [AI_POOL]: [0, 0] },
  'globex-production': { [AI_POOL]: [4_272.4, 0] },
  'globex-staging': { [AI_POOL]: [509, 0] },
};

type UsageInstance = { licenseId: string; slug?: string | null };

/** The usage rows of the pools, measured against the grants of each instance's licence. */
export const buildAiEntitlementUsages = (
  instances: readonly UsageInstance[],
  grants: readonly LicenseEntitlement[],
  period: { currentPeriodEnd: string; currentPeriodStart: string },
): Record<string, EntitlementUsage[]> =>
  Object.fromEntries(
    instances.map((instance) => {
      const slug = instance.slug ?? '';
      const rows = grants
        .filter((grant) => grant.licenseId === instance.licenseId)
        .flatMap((grant): EntitlementUsage[] => {
          const pool = grant.entitlementSlug ?? '';
          const used = AI_USAGE[slug]?.[pool];
          if (!used) return [];
          return [
            {
              ...period,
              entitlementId: `entitlement-${pool}`,
              entitlementSlug: pool,
              licenseId: grant.licenseId,
              licenseSlug: grant.licenseSlug,
              limit: grant.value,
              limitCapExceededOveragePercent:
                grant.limitCapExceededOveragePercent ?? 0,
              provenance: identityProvenance(grant),
              reserved: String(used[1]),
              source: 'license',
              value: { type: 'number', value: used[0] },
            },
          ];
        });
      return [slug, rows];
    }),
  );

type FeedEntry = {
  /** Minutes before `now` the request was reported. */
  ago: number;
  denial?: 'MODEL_ARCHIVED' | 'NO_RULE' | 'UNKNOWN_MODEL';
  /** The model as the integration sent it. */
  model: string;
  modelSlug?: string;
  requestStatus?: AiRequestStatus;
  requestType: AiInference['requestType'];
  reserved?: string;
  status?: 'EXPIRED' | 'RESERVED';
  usage?: AiUsage;
  /** Recorded before snapshots existed: no `pricing`, licence or vendor cost on the row. */
  legacy?: boolean;
  /** The terms applied at commit where the rule has been edited since. */
  appliedTerms?: Partial<
    Pick<
      ConversionRule,
      'maximumCreditsPerRequest' | 'minimumCreditsPerRequest' | 'rates'
    >
  >;
  /** Refunds made right after the commit: [credits, reason, minutes after it]. */
  refunds?: Array<[credits: string, reason: string | undefined, after: number]>;
  /** A release that closed no reservation: hidden from the feed by default. */
  tombstone?: boolean;
  /** The vendor cost the caller sent with the commit, in USD. */
  vendorReported?: string;
  warnings?: string[];
};

/** Who refunds in the mocks: a person other than the one who wrote the rules. */
export const AI_SUPPORT_USER = {
  id: 'user-ada',
  name: 'Ada Lovelace',
} as const;

const SONNET_ID = 'claude-sonnet-4-5-20250929';

// Acme Production's feed, newest first: charged, raised to the minimum, priced
// through a wildcard, a provider error the rule does not charge, each denial,
// an expired reservation and two open ones.
const ACME_FEED: FeedEntry[] = [
  {
    ago: 1,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestType: 'COMPLETION',
    reserved: '250',
    status: 'RESERVED',
  },
  {
    ago: 2,
    model: 'gpt-5',
    modelSlug: 'gpt-5',
    requestType: 'COMPLETION',
    reserved: '1000.5',
    status: 'RESERVED',
  },
  {
    ago: 14,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '2.15',
    usage: { cacheReadInputTokens: 3100, inputTokens: 1240, outputTokens: 380 },
    // Dearer than the catalogue says: the receipt shows the difference.
    vendorReported: '0.0118',
  },
  {
    ago: 21,
    model: 'gpt-5-mini',
    modelSlug: 'gpt-5-mini',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '1',
    usage: { inputTokens: 4200, outputTokens: 1850 },
    // Priced before the rule's rates were raised: "Rule edited since".
    appliedTerms: {
      rates: { perInputToken: '0.000025', perOutputToken: '0.0002' },
    },
  },
  {
    ago: 28,
    model: 'gemini-2.5-flash',
    modelSlug: 'gemini-2-5-flash',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '1.5',
    usage: { inputTokens: 2000, outputTokens: 800 },
  },
  {
    ago: 37,
    model: 'gpt-image-1',
    modelSlug: 'gpt-image-1',
    requestStatus: 'SUCCESS',
    requestType: 'IMAGE_GENERATION',
    reserved: '10',
    usage: { unitType: 'image', units: '2' },
  },
  {
    ago: 43,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestStatus: 'PROVIDER_ERROR',
    requestType: 'COMPLETION',
    reserved: '3.4',
    usage: { inputTokens: 3000, outputTokens: 440 },
  },
  {
    ago: 51,
    denial: 'UNKNOWN_MODEL',
    model: 'mistral-large-2411',
    requestStatus: 'NOT_SENT',
    requestType: 'COMPLETION',
  },
  {
    ago: 65,
    denial: 'MODEL_ARCHIVED',
    model: 'whisper-large-v3',
    modelSlug: 'whisper-large-v3',
    requestStatus: 'NOT_SENT',
    requestType: 'AUDIO',
  },
  {
    ago: 73,
    model: 'text-embedding-3-small',
    modelSlug: 'text-embedding-3-small',
    requestStatus: 'SUCCESS',
    requestType: 'EMBEDDING',
    reserved: '0.05',
    usage: { inputTokens: 14000 },
  },
  {
    ago: 88,
    denial: 'NO_RULE',
    model: 'voyage-3',
    modelSlug: 'voyage-3',
    requestStatus: 'NOT_SENT',
    requestType: 'EMBEDDING',
  },
  {
    ago: 100,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestType: 'COMPLETION',
    reserved: '2.4',
    status: 'EXPIRED',
  },
  {
    ago: 116,
    model: 'gpt-4o-transcribe',
    modelSlug: 'gpt-4o-transcribe',
    requestStatus: 'SUCCESS',
    requestType: 'AUDIO',
    reserved: '2',
    usage: { durationMs: 95000, unitType: 'second', units: '95' },
    // As the catalogue computes it: no difference to show.
    vendorReported: '0.0095',
  },
  {
    ago: 140,
    model: 'gpt-5',
    modelSlug: 'gpt-5',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '1.2',
    usage: { inputTokens: 6000, outputTokens: 3000 },
    legacy: true,
  },
  {
    ago: 155,
    model: 'claude-haiku-4-5-20251001',
    modelSlug: 'claude-haiku-4-5',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '3',
    usage: { inputTokens: 2000, outputTokens: 600 },
    legacy: true,
    warnings: ['PRICING_SNAPSHOT_UNREADABLE'],
  },
  {
    ago: 162,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '0.6',
    usage: { inputTokens: 120, outputTokens: 40 },
  },
  // Older rows, added after the sixteen above so that their ids stay: a charge
  // refunded in part, an unknown model whose name is close to a catalogue one,
  // a release that closed no reservation, and a commit whose counter lost
  // precision.
  {
    ago: 170,
    model: 'gpt-5',
    modelSlug: 'gpt-5',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '80',
    usage: { inputTokens: 52000, outputTokens: 21000 },
    refunds: [['30', 'Duplicate call after a client retry', 2]],
  },
  {
    ago: 176,
    denial: 'UNKNOWN_MODEL',
    model: 'gpt-5-mini-2025-08-07',
    requestStatus: 'NOT_SENT',
    requestType: 'COMPLETION',
  },
  {
    ago: 181,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestType: 'COMPLETION',
    tombstone: true,
  },
  {
    ago: 190,
    model: SONNET_ID,
    modelSlug: 'claude-sonnet-4-5',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '4',
    usage: { inputTokens: 5000, outputTokens: 900 },
    warnings: ['COUNTER_PRECISION_DEGRADED'],
  },
];

// Globex Production, near its limit: priced on Business.
const GLOBEX_FEED: FeedEntry[] = [
  {
    ago: 6,
    model: 'gpt-5-mini',
    modelSlug: 'gpt-5-mini',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '1',
    usage: { inputTokens: 3000, outputTokens: 900 },
  },
  {
    ago: 33,
    model: 'gemini-2.5-pro',
    modelSlug: 'gemini-2-5-pro',
    requestStatus: 'SUCCESS',
    requestType: 'COMPLETION',
    reserved: '2',
    usage: { inputTokens: 1500, outputTokens: 500 },
  },
  {
    ago: 47,
    model: 'gpt-image-1',
    modelSlug: 'gpt-image-1',
    requestStatus: 'NOT_SENT',
    denial: 'NO_RULE',
    requestType: 'IMAGE_GENERATION',
  },
];

/**
 * The snapshot the API stores on an inference at commit: the rule's terms as
 * they were, with the blank rates left out.
 */
export const aiPricingSnapshot = (
  rule: Pick<
    ConversionRule,
    | 'chargeOnError'
    | 'id'
    | 'maximumCreditsPerRequest'
    | 'minimumCreditsPerRequest'
    | 'modelSlug'
    | 'rates'
    | 'requestType'
    | 'status'
  >,
): AiInferencePricing => ({
  chargeOnError: rule.chargeOnError,
  maximumCreditsPerRequest: rule.maximumCreditsPerRequest,
  minimumCreditsPerRequest: rule.minimumCreditsPerRequest,
  rates: Object.fromEntries(
    Object.entries(rule.rates).filter(([, rate]) => rate != null),
  ),
  ruleId: rule.id,
  specificity: specificityOf(rule),
});

/** The transaction ids of Acme Production's feed, newest first, for specs. */
export const ACME_TRANSACTION = (index: number) =>
  `txn_acme_${String(index + 1).padStart(3, '0')}`;

const NEWEST_REPORT_SEQ = 4_820;

/** A refund's id, a UUID numbered by its place in the journal. */
export const refundId = (reportSeq: number) =>
  `00000000-0000-4000-b000-${reportSeq.toString(16).padStart(12, '0')}`;

const minutesBefore = (now: number, minutes: number, seconds = 0) =>
  new Date(now - minutes * 60_000 + seconds * 1000).toISOString();

function refundsOf(
  entry: FeedEntry,
  context: FeedContext,
  reportSeq: number,
): AiInferenceRefund[] {
  return (entry.refunds ?? []).map(([credits, reason, after], index) => ({
    createdAt: minutesBefore(context.now, entry.ago - after),
    createdBy: AI_SUPPORT_USER,
    credits,
    id: refundId(reportSeq + index + 1),
    ...(reason ? { reason } : {}),
    reportSeq: reportSeq + index + 1,
  }));
}

function buildRow(
  entry: FeedEntry,
  transactionId: string,
  context: FeedContext,
  reportSeq: number,
): AiInferenceRecord {
  const reportedAt = minutesBefore(context.now, entry.ago);
  const licence = entry.legacy
    ? {}
    : { licenseId: context.licenseId, licenseSlug: context.licenseSlug };
  const base: AiInferenceRecord = {
    credits: entry.reserved ? { reserved: entry.reserved } : {},
    entitlementSlug: context.pool,
    instanceSlug: context.instanceSlug,
    ...licence,
    model: entry.model,
    modelSlug: entry.modelSlug,
    refunds: [],
    reportedAt,
    requestStatus: entry.requestStatus,
    requestType: entry.requestType,
    status: entry.status ?? 'COMMITTED',
    transactionId,
    usage: entry.usage ?? {},
    warnings: entry.warnings ?? [],
    windowStart: context.windowStart,
  };
  if (entry.tombstone) {
    return { ...base, status: 'RELEASED', warnings: ['NO_RESERVATION'] };
  }
  if (entry.denial) {
    return {
      ...base,
      authorized: false,
      credits: { charged: '0', computed: '0', reserved: '0' },
      denialReason: entry.denial,
      status: 'RELEASED',
    };
  }
  if (entry.status) {
    // Open (RESERVED, for half an hour more) or lapsed (EXPIRED, five minutes
    // after it was reported): a hold, never a charge.
    return {
      ...base,
      authorized: true,
      expiresAt:
        entry.status === 'RESERVED'
          ? minutesBefore(context.now, -30)
          : minutesBefore(context.now, entry.ago - 5),
    };
  }
  const model =
    context.models.find((item) => item.slug === entry.modelSlug) ?? null;
  const resolved = resolveRule(context.rules, model, entry.requestType);
  if (!resolved) {
    throw new Error(`No rule prices ${entry.model} in the AI feed fixture`);
  }
  const rule = resolved.rule as ConversionRule;
  // What the server applied: the rule as it was at commit.
  const applied = { ...rule, ...entry.appliedTerms };
  const priced = priceUsage(applied, entry.usage, entry.requestStatus);
  if (!priced.ok) {
    throw new Error(
      `The AI feed fixture cannot price ${entry.model}: ${priced.error}`,
    );
  }
  const charged = priced.chargeable ? priced.charged : '0';
  const refunds = refundsOf(entry, context, reportSeq);
  const refunded = refunds.reduce((sum, item) => sum + Number(item.credits), 0);
  const computedCost = vendorCost(model?.vendorCosts, entry.usage).total;
  return {
    ...base,
    authorized: true,
    committedAt: minutesBefore(context.now, entry.ago, 2),
    conversionRuleId: rule.id,
    credits: {
      charged,
      computed: priced.computed,
      ...(refunds.length ? { refunded: String(refunded) } : {}),
      reserved: entry.reserved,
    },
    refunds,
    ...(Number(charged) > 0 ? { reportSeq } : {}),
    ...(entry.legacy
      ? {}
      : {
          pricing: aiPricingSnapshot(applied),
          vendorCost: {
            currency: 'USD' as const,
            ...(computedCost ? { computed: computedCost } : {}),
            ...(entry.vendorReported ? { reported: entry.vendorReported } : {}),
          },
        }),
  };
}

type FeedContext = {
  instanceSlug: string;
  /**
   * The licence version of the instance: the rules considered are its own. The
   * API names it by a UUID, which the licences of the mocks do not have.
   */
  licenseId: string;
  licenseSlug: string;
  models: readonly Model[];
  now: number;
  pool: string;
  rules: readonly ConversionRule[];
  windowStart: string;
};

/**
 * Prices a feed with the console's own engine (`@/domains/ai-credits/pricing`),
 * which mirrors the API, and chains the counter: the newest commit ends at what
 * the pool has consumed.
 */
function buildFeed(
  entries: FeedEntry[],
  prefix: string,
  context: FeedContext & { consumed: number },
) {
  // The journal's sequence falls by ten from one row to the next older one,
  // which leaves room for the refunds of a row right after it.
  const rows = entries.map((entry, index) =>
    buildRow(
      entry,
      `${prefix}_${String(index + 1).padStart(3, '0')}`,
      context,
      NEWEST_REPORT_SEQ - index * 10,
    ),
  );
  let after = context.consumed;
  for (const row of rows) {
    if (row.status !== 'COMMITTED') continue;
    const charged = Number(row.credits.charged ?? '0');
    // A refund is made right after its commit: the counter the commit left is
    // what the next row found, plus what was given back in between.
    const refunded = Number(row.credits.refunded ?? '0');
    row.valueAfter = Math.round((after + refunded) * 1e6) / 1e6;
    row.valueBefore = Math.round((row.valueAfter - charged) * 1e6) / 1e6;
    after = row.valueBefore;
  }
  return rows;
}

/** Every inference of the mocks: Acme Production's feed and Globex Production's. */
export const buildAiInferences = ({
  models,
  now,
  rules,
  windowStart,
}: {
  models: readonly Model[];
  now: number;
  rules: readonly ConversionRule[];
  windowStart: string;
}): AiInferenceRecord[] => {
  const on = (licenseSlug: string) =>
    rules.filter(
      (rule) =>
        rule.licenseSlug === licenseSlug &&
        rule.entitlementSlug === AI_POOL &&
        rule.status === 'ACTIVE',
    );
  return [
    ...buildFeed(ACME_FEED, 'txn_acme', {
      consumed: AI_USAGE['acme-production'][AI_POOL][0],
      instanceSlug: 'acme-production',
      licenseId: '00000000-0000-4000-a000-0000000000e2',
      licenseSlug: 'enterprise-v2',
      models,
      now,
      pool: AI_POOL,
      rules: on('enterprise-v2'),
      windowStart,
    }),
    ...buildFeed(GLOBEX_FEED, 'txn_globex', {
      consumed: AI_USAGE['globex-production'][AI_POOL][0],
      instanceSlug: 'globex-production',
      licenseId: '00000000-0000-4000-a000-0000000000b1',
      licenseSlug: 'business',
      models,
      now,
      pool: AI_POOL,
      rules: on('business'),
      windowStart,
    }),
  ];
};
