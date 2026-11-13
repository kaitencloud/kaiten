import type {
  AiInference,
  AiInferenceRefund,
  ConversionRule,
  CreateConversionRule,
  License,
  LicenseEntitlement,
  ListAiInferencesData,
  ListConversionRulesData,
  ListModelsData,
  Model,
  ModelWritable,
  NewAiInferenceRefund,
  UpdateConversionRule,
} from '@/api-client';
import {
  zAiInference,
  zConversionRule,
  zEntitlement,
  zLicense,
  zLicenseEntitlement,
  zModel,
} from '@/api-client/zod.gen';
import type { Entitlement } from '@/api-client';
import { priceUsage } from '@/domains/ai-credits/pricing';
import { aiRuleId } from '../fixtures/build-ai-catalogue';
import { TEST_USER } from '../fixtures/build-customer';
import type { AiAddonGrantSeed } from '../fixtures/build-ai-addon-grants';
import type { AiInferenceRecord } from '../fixtures/build-ai-usage';
import {
  matchesInferenceQuery,
  type RefundKey,
  refundInference,
} from './ai-usage-ledger';
import { parseContract } from '../contracts/openapi-contract';
import type { GraphQLVariables } from '../contracts/mock-http';
import { BillingProblem } from './billing-problem';
import { aiAddonGrantsAnswer, aiRateCardAnswer } from './ai-graphql';

export type AiAppModelSeed = {
  /** What add-on versions can grant of the pools, by licence family. */
  addonGrants?: AiAddonGrantSeed[];
  /**
   * Billing is off on the deployment: `License.addonGrants` answers
   * `Billing.Disabled`. The rules keep their `grantedByAddons`, which does not
   * need billing.
   */
  billingDisabled?: boolean;
  /** The licence versions the rules sit on, and what they grant: the rules' world. */
  grants?: LicenseEntitlement[];
  inferences?: AiInferenceRecord[];
  licenses?: License[];
  models?: Model[];
  /** The credit pools (`NUMBER_AI_CREDIT` entitlements) a rule may price. */
  pools?: Entitlement[];
  /** `<instanceSlug>/<poolSlug>` pairs the instance no longer holds: a refund is refused. */
  poolsNoLongerGranted?: string[];
  rules?: ConversionRule[];
};

export type SerializedAiAppModel = Required<AiAppModelSeed> & {
  clock: number;
  /** The idempotency keys of the refunds, by `<instance>/<pool>` then key. */
  refundKeys: Record<string, Record<string, RefundKey>>;
  sequence: number;
};

/** What a refund did, for whoever serves the pool's usage. */
export type AiRefundEffect = {
  credits: string;
  entitlementSlug: string;
  instanceSlug: string;
};

const clone = <T>(value: T): T => structuredClone(value);
const problem = (status: number, code: string, detail: string) =>
  new BillingProblem(status, code, detail);
const DEFAULT_PAGE = 50;

/**
 * The AI credits area as the API serves it: the model catalogue, the conversion
 * rules of each licence version, the inference feed and the open reservations of
 * each instance's pools, and the GraphQL documents that read them with the
 * licences. It refuses with the codes and statuses of the API. Imports nothing
 * from Playwright, since the browser mocks import it too.
 *
 * It keeps its own copy of the licences and their grants, as every model of the
 * mocks keeps its own copy of what it reads.
 */
export class AiAppModel {
  private addonGrants: AiAddonGrantSeed[];
  private billingDisabled: boolean;
  private clock: number;
  private grants: LicenseEntitlement[];
  private inferences: AiInferenceRecord[];
  private licenses: License[];
  private models: Model[];
  private pools: Entitlement[];
  private poolsNoLongerGranted: string[];
  private refundKeys: Record<string, Record<string, RefundKey>>;
  private rules: ConversionRule[];
  private sequence: number;

  constructor(
    seed: AiAppModelSeed = {},
    state?: {
      clock: number;
      refundKeys?: Record<string, Record<string, RefundKey>>;
      sequence: number;
    },
  ) {
    this.addonGrants = clone(seed.addonGrants ?? []);
    this.billingDisabled = seed.billingDisabled ?? false;
    this.poolsNoLongerGranted = [...(seed.poolsNoLongerGranted ?? [])];
    this.refundKeys = clone(state?.refundKeys ?? {});
    this.models = (seed.models ?? []).map((model) =>
      parseContract(zModel, clone(model), 'AI model seed'),
    );
    this.rules = (seed.rules ?? []).map((rule) =>
      parseContract(zConversionRule, clone(rule), 'AI rule seed'),
    );
    this.licenses = (seed.licenses ?? []).map((license) =>
      parseContract(zLicense, clone(license), 'AI licence seed'),
    );
    this.grants = (seed.grants ?? []).map((grant) =>
      parseContract(zLicenseEntitlement, clone(grant), 'AI grant seed'),
    );
    this.pools = (seed.pools ?? []).map((pool) =>
      parseContract(zEntitlement, clone(pool), 'AI pool seed'),
    );
    this.inferences = (seed.inferences ?? []).map((row) => {
      const {
        entitlementSlug: _pool,
        instanceSlug: _instance,
        ...inference
      } = row;
      parseContract(zAiInference, inference, 'AI inference seed');
      return clone(row);
    });
    this.clock = state?.clock ?? Date.parse('2026-11-11T09:40:00.000Z');
    this.sequence = state?.sequence ?? 1000;
  }

  static fromSerialized({
    clock,
    refundKeys,
    sequence,
    ...seed
  }: SerializedAiAppModel) {
    return new AiAppModel(seed, { clock, refundKeys, sequence });
  }

  serializeForMsw(): SerializedAiAppModel {
    return clone({
      addonGrants: this.addonGrants,
      billingDisabled: this.billingDisabled,
      clock: this.clock,
      grants: this.grants,
      inferences: this.inferences,
      licenses: this.licenses,
      models: this.models,
      pools: this.pools,
      poolsNoLongerGranted: this.poolsNoLongerGranted,
      refundKeys: this.refundKeys,
      rules: this.rules,
      sequence: this.sequence,
    });
  }

  private now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  // Models ------------------------------------------------------------------

  listModels(query: ListModelsData['query'] = {}) {
    const rows = this.models
      .filter((model) => !query.status || model.status === query.status)
      .filter((model) => !query.vendor || model.vendor === query.vendor)
      .filter((model) => !query.modality || model.modality === query.modality)
      .sort((a, b) => a.slug.localeCompare(b.slug));
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const limit = query.limit ?? DEFAULT_PAGE;
    const hasMore = offset + limit < rows.length;
    return {
      hasMore,
      items: clone(rows.slice(offset, offset + limit)),
      ...(hasMore ? { nextCursor: String(offset + limit) } : {}),
    };
  }

  getModel(slug: string): Model {
    const model = this.models.find((item) => item.slug === slug);
    if (!model) throw problem(404, 'GetModel.NotFound', 'model not found');
    return clone(model);
  }

  /** A slug and the external ids of every model share one namespace, as in the API. */
  private assertIdentifiersFree(body: ModelWritable, except?: string) {
    const others = this.models.filter((item) => item.slug !== except);
    if (!except && others.some((item) => item.slug === body.slug)) {
      throw problem(
        409,
        'CreateModel.SlugConflict',
        'model slug already exists',
      );
    }
    const taken = new Set(
      others.flatMap((item) => [item.slug, ...(item.externalIds ?? [])]),
    );
    const claimed = [...(body.externalIds ?? [])];
    if (
      claimed.some((id) => taken.has(id)) ||
      others.some((item) => item.externalIds?.includes(body.slug))
    ) {
      throw problem(
        409,
        'CreateModel.ExternalIdConflict',
        "model slug is another model's external ID",
      );
    }
  }

  createModel(body: ModelWritable): Model {
    this.assertIdentifiersFree(body);
    const at = this.now();
    const model = parseContract(
      zModel,
      {
        ...clone(body),
        createdAt: at,
        id: `model-${body.slug}`,
        status: body.status ?? 'ACTIVE',
        updatedAt: at,
      },
      'createModel',
    );
    this.models.push(model);
    return clone(model);
  }

  updateModel(slug: string, body: ModelWritable): Model {
    const current = this.getModel(slug);
    if (body.slug !== slug)
      throw problem(
        422,
        'UpdateModel.ImmutableSlug',
        'model slug is immutable',
      );
    if (body.modality !== current.modality)
      throw problem(
        422,
        'UpdateModel.ImmutableModality',
        'model modality is immutable',
      );
    this.assertIdentifiersFree(body, slug);
    const model = {
      ...clone(body),
      createdAt: current.createdAt,
      id: current.id,
      updatedAt: this.now(),
    };
    this.models = this.models.map((item) =>
      item.slug === slug ? model : item,
    );
    return clone(model);
  }

  deleteModel(slug: string) {
    this.getModel(slug);
    if (this.rules.some((rule) => rule.modelSlug === slug)) {
      throw problem(
        409,
        'DeleteModel.InUse',
        'model is referenced by a conversion rule',
      );
    }
    this.models = this.models.filter((item) => item.slug !== slug);
  }

  // Conversion rules -------------------------------------------------------

  private license(slug: string) {
    const license = this.licenses.find((item) => item.slug === slug);
    if (!license)
      throw problem(404, 'GetLicense.NotFound', 'license not found');
    return license;
  }

  private isGranted(licenseSlug: string, entitlementSlug: string) {
    return this.grants.some(
      (grant) =>
        grant.licenseSlug === licenseSlug &&
        grant.entitlementSlug === entitlementSlug,
    );
  }

  /** The add-on grants of a licence's family, which every version of it shares. */
  addonGrantsOf(licenseSlug: string, entitlementSlug?: string | null) {
    const familyId = this.licenses.find(
      (item) => item.slug === licenseSlug,
    )?.familyId;
    const family = new Set(
      this.licenses
        .filter((item) => familyId && item.familyId === familyId)
        .map((item) => item.slug),
    );
    return this.addonGrants
      .filter(
        (grant) =>
          family.has(grant.licenseSlug) &&
          (!entitlementSlug || grant.entitlementSlug === entitlementSlug),
      )
      .map(({ licenseSlug: _license, ...grant }) => clone(grant));
  }

  /** Both grant sources are read, never stored: a grant added later counts at once. */
  private present(rule: ConversionRule): ConversionRule {
    return {
      ...clone(rule),
      grantedByAddons:
        this.addonGrantsOf(rule.licenseSlug, rule.entitlementSlug).length > 0,
      grantedByLicense: this.isGranted(rule.licenseSlug, rule.entitlementSlug),
    };
  }

  rulesOf(
    licenseSlug: string,
    status?: ConversionRule['status'],
  ): ConversionRule[] {
    return this.rules
      .filter(
        (rule) =>
          rule.licenseSlug === licenseSlug &&
          (!status || rule.status === status),
      )
      .map((rule) => this.present(rule));
  }

  listRules(licenseSlug: string, query: ListConversionRulesData['query'] = {}) {
    this.license(licenseSlug);
    return this.rulesOf(licenseSlug, query.status ?? 'ACTIVE')
      .filter(
        (rule) =>
          !query.entitlementSlug ||
          rule.entitlementSlug === query.entitlementSlug,
      )
      .filter((rule) => !query.modelSlug || rule.modelSlug === query.modelSlug);
  }

  getRule(
    licenseSlug: string,
    ruleId: string,
    code = 'GetConversionRule.NotFound',
  ) {
    const rule = this.rules.find(
      (item) => item.licenseSlug === licenseSlug && item.id === ruleId,
    );
    if (!rule) throw problem(404, code, 'conversion rule not found');
    return this.present(rule);
  }

  private assertTerms(body: CreateConversionRule | UpdateConversionRule) {
    const priced = priceUsage(
      {
        chargeOnError: body.chargeOnError ?? 'NEVER',
        maximumCreditsPerRequest: body.maximumCreditsPerRequest ?? null,
        minimumCreditsPerRequest: body.minimumCreditsPerRequest ?? '0',
        rates: body.rates,
      },
      {},
    );
    if (!priced.ok) {
      const field =
        priced.error === 'INVALID_MINIMUM'
          ? 'minimumCreditsPerRequest'
          : priced.error === 'INVALID_MAXIMUM'
            ? 'maximumCreditsPerRequest'
            : 'rates';
      throw new BillingProblem(
        422,
        `ConversionRule.${field}`,
        `invalid ${field}`,
        { errors: [{ location: `body.${field}`, message: priced.error }] },
      );
    }
  }

  createRule(licenseSlug: string, body: CreateConversionRule): ConversionRule {
    this.license(licenseSlug);
    const pool = this.pools.find((item) => item.slug === body.entitlementSlug);
    if (!pool)
      throw problem(
        404,
        'CreateConversionRule.EntitlementNotFound',
        'entitlement not found',
      );
    if (pool.type !== 'NUMBER_AI_CREDIT')
      throw problem(
        422,
        'CreateConversionRule.EntitlementNotAiCreditPool',
        'entitlement must be a SUM AI credit pool',
      );
    if (body.modelSlug) {
      const model = this.models.find((item) => item.slug === body.modelSlug);
      if (!model)
        throw problem(
          404,
          'CreateConversionRule.ModelNotFound',
          'model not found',
        );
      if (model.status === 'DEPRECATED')
        throw problem(
          422,
          'CreateConversionRule.ModelDeprecated',
          'deprecated models take no new rules',
        );
      if (model.status === 'ARCHIVED')
        throw problem(
          422,
          'CreateConversionRule.ModelArchived',
          'archived models take no new rules',
        );
    }
    this.assertTerms(body);
    const modelSlug = body.modelSlug ?? null;
    const requestType = body.requestType ?? null;
    if (
      this.rules.some(
        (rule) =>
          rule.status === 'ACTIVE' &&
          rule.licenseSlug === licenseSlug &&
          rule.entitlementSlug === body.entitlementSlug &&
          rule.modelSlug === modelSlug &&
          rule.requestType === requestType,
      )
    ) {
      throw problem(
        409,
        'CreateConversionRule.Conflict',
        'an active rule already has this identity',
      );
    }
    const at = this.now();
    const rule = parseContract(
      zConversionRule,
      {
        chargeOnError: body.chargeOnError ?? 'NEVER',
        createdAt: at,
        createdBy: TEST_USER,
        entitlementSlug: body.entitlementSlug,
        grantedByLicense: false,
        id: aiRuleId((this.sequence += 1)),
        licenseSlug,
        maximumCreditsPerRequest: body.maximumCreditsPerRequest ?? null,
        minimumCreditsPerRequest: body.minimumCreditsPerRequest ?? '0',
        modelSlug,
        rates: clone(body.rates),
        requestType,
        grantedByAddons: false,
        status: 'ACTIVE' as const,
        updatedAt: at,
        updatedBy: TEST_USER,
      },
      'createConversionRule',
    );
    this.rules.push(rule);
    return this.present(rule);
  }

  updateRule(
    licenseSlug: string,
    ruleId: string,
    body: UpdateConversionRule,
  ): ConversionRule {
    const current = this.getRule(
      licenseSlug,
      ruleId,
      'UpdateConversionRule.NotFound',
    );
    if (current.status === 'ARCHIVED')
      throw problem(
        409,
        'UpdateConversionRule.Archived',
        'archived rules cannot be updated',
      );
    if (
      body.entitlementSlug != null &&
      body.entitlementSlug !== current.entitlementSlug
    )
      throw problem(
        422,
        'UpdateConversionRule.ImmutableEntitlement',
        'entitlementSlug is immutable',
      );
    if (body.modelSlug !== undefined && body.modelSlug !== current.modelSlug)
      throw problem(
        422,
        'UpdateConversionRule.ImmutableModel',
        'modelSlug is immutable',
      );
    if (
      body.requestType !== undefined &&
      body.requestType !== current.requestType
    )
      throw problem(
        422,
        'UpdateConversionRule.ImmutableRequestType',
        'requestType is immutable',
      );
    this.assertTerms(body);
    const updated: ConversionRule = {
      ...current,
      chargeOnError: body.chargeOnError ?? current.chargeOnError,
      maximumCreditsPerRequest:
        body.maximumCreditsPerRequest === undefined
          ? current.maximumCreditsPerRequest
          : body.maximumCreditsPerRequest,
      minimumCreditsPerRequest:
        body.minimumCreditsPerRequest ?? current.minimumCreditsPerRequest,
      rates: clone(body.rates),
      updatedAt: this.now(),
      updatedBy: TEST_USER,
    };
    this.rules = this.rules.map((rule) =>
      rule.id === ruleId ? updated : rule,
    );
    return this.present(updated);
  }

  archiveRule(licenseSlug: string, ruleId: string) {
    this.getRule(licenseSlug, ruleId, 'ArchiveConversionRule.NotFound');
    const at = this.now();
    this.rules = this.rules.map((rule) =>
      rule.id === ruleId
        ? { ...rule, status: 'ARCHIVED', updatedAt: at, updatedBy: TEST_USER }
        : rule,
    );
  }

  // Usage ------------------------------------------------------------------

  private feedOf(instanceSlug: string, entitlementSlug: string) {
    return this.inferences.filter(
      (row) =>
        row.instanceSlug === instanceSlug &&
        row.entitlementSlug === entitlementSlug,
    );
  }

  private static strip({
    entitlementSlug: _pool,
    instanceSlug: _instance,
    ...row
  }: AiInferenceRecord): AiInference {
    return clone(row);
  }

  /** Newest first, filtered and paged as the API does: `limit` rows after the cursor. */
  listInferences(
    instanceSlug: string,
    entitlementSlug: string,
    query: ListAiInferencesData['query'] = {},
  ) {
    const from = query.from ? Date.parse(query.from) : -Infinity;
    const to = query.to ? Date.parse(query.to) : Infinity;
    if (from >= to)
      throw problem(
        422,
        'ListAiInferences.InvalidRange',
        'from must be before to',
      );
    const offset =
      query.cursor === undefined ? 0 : Number.parseInt(query.cursor, 10);
    if (Number.isNaN(offset))
      throw problem(400, 'ListAiInferences.InvalidCursor', 'invalid cursor');
    const rows = this.feedOf(instanceSlug, entitlementSlug)
      .filter((row) => matchesInferenceQuery(row, query))
      .filter(
        (row) =>
          Date.parse(row.reportedAt) >= from && Date.parse(row.reportedAt) < to,
      )
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
    const limit = query.limit ?? DEFAULT_PAGE;
    const hasMore = offset + limit < rows.length;
    return {
      hasMore,
      items: rows.slice(offset, offset + limit).map(AiAppModel.strip),
      ...(hasMore ? { nextCursor: String(offset + limit) } : {}),
    };
  }

  /** The open holds: reserved and not yet expired, by the clock of the page. */
  listReservations(
    instanceSlug: string,
    entitlementSlug: string,
    now = Date.now(),
  ) {
    return {
      items: this.feedOf(instanceSlug, entitlementSlug)
        .filter(
          (row) =>
            row.status === 'RESERVED' &&
            (!row.expiresAt || Date.parse(row.expiresAt) > now),
        )
        .map(AiAppModel.strip),
    };
  }

  /**
   * Refunds a charge, as `refundAiInference` does. The usage of the pool is
   * another model's: the effect is returned for whoever serves it.
   */
  refundInference(
    path: {
      entitlementSlug: string;
      instanceSlug: string;
      transactionId: string;
    },
    body: NewAiInferenceRefund,
    idempotencyKey: string | null,
  ): {
    effect: AiRefundEffect | null;
    refund: AiInferenceRefund;
    replayed: boolean;
  } {
    const pair = `${path.instanceSlug}/${path.entitlementSlug}`;
    const keys = (this.refundKeys[pair] ??= {});
    const { refund, replayed } = refundInference({
      body,
      by: TEST_USER,
      idempotencyKey,
      keys,
      now: new Date().toISOString(),
      poolGranted: !this.poolsNoLongerGranted.includes(pair),
      rows: this.feedOf(path.instanceSlug, path.entitlementSlug),
      transactionId: path.transactionId,
    });
    return {
      effect: replayed
        ? null
        : {
            credits: refund.credits,
            entitlementSlug: path.entitlementSlug,
            instanceSlug: path.instanceSlug,
          },
      refund: clone(refund),
      replayed,
    };
  }

  // GraphQL ----------------------------------------------------------------

  /**
   * `License.addonGrants`. Where billing is off the field is refused, which the
   * API answers as a GraphQL error (status 200) carrying the code; a token
   * without `read:addons` is refused before, by the document's scopes.
   */
  aiAddonGrants(variables: GraphQLVariables) {
    if (this.billingDisabled) {
      throw problem(
        200,
        'Billing.Disabled',
        'billing is disabled on this deployment',
      );
    }
    return aiAddonGrantsAnswer(
      {
        addonGrantsOf: (license, pool) => this.addonGrantsOf(license, pool),
        licenses: this.licenses,
      },
      variables,
    );
  }

  aiRateCard(variables: GraphQLVariables) {
    return aiRateCardAnswer(this.graphWorld(), variables);
  }

  private graphWorld() {
    return {
      grants: this.grants,
      licenses: this.licenses,
      pools: this.pools,
      rulesOf: (licenseSlug: string, status?: ConversionRule['status']) =>
        this.rulesOf(licenseSlug, status),
    };
  }
}
