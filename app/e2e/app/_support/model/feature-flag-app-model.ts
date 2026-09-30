import { z } from 'zod';
import type {
  EvaluationSuccess,
  FeatureFlag,
  FeatureFlagWritable,
  User,
} from '@/api-client';
import {
  zEvaluationSuccess,
  zFeatureFlag,
  zFeatureFlagWritable,
} from '@/api-client/zod.gen';
import { parseContract } from '../contracts/openapi-contract';
import { ErrorInjector } from './error-injector';

type FeatureFlagErrorOp = 'create' | 'update' | 'delete' | 'evaluate';

const DEFAULT_ACTOR: User = {
  id: 'user-e2e',
  name: 'E2E Tester',
};

type FeatureFlagRecord = FeatureFlag & {
  createdAt: string;
  createdBy: User;
  updatedAt: string;
  updatedBy: User;
};

type RolloutDateLike =
  | Extract<FeatureFlagRecord['default_variant'], { type: 'rollout_date' }>
  | Extract<
      NonNullable<FeatureFlagRecord['targetings']>[number],
      { type: 'rollout_date' }
    >;

export type FeatureFlagAppModelSeed = {
  featureFlags?: FeatureFlagRecord[];
};

export type SerializedFeatureFlagAppModel =
  Required<FeatureFlagAppModelSeed> & {
    clock: number;
    pendingErrors: Array<[FeatureFlagErrorOp, number]>;
    sequence: number;
  };

const clone = <T>(value: T): T => structuredClone(value);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeContextValue = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
};

export class FeatureFlagAppModel {
  private clock = Date.parse('2026-03-01T08:00:00.000Z');
  private featureFlags: FeatureFlagRecord[];
  private sequence: number;
  private readonly errors = new ErrorInjector<FeatureFlagErrorOp>();

  /**
   * Arm the next call to `op` to fail with the given HTTP status. One-shot.
   */
  setNextError(op: FeatureFlagErrorOp, status: number) {
    this.errors.setNextError(op, status);
  }

  static fromSerialized(state: SerializedFeatureFlagAppModel) {
    const model = new FeatureFlagAppModel({
      featureFlags: state.featureFlags,
    });
    model.clock = state.clock;
    model.sequence = state.sequence;
    model.errors.restore(state.pendingErrors);
    return model;
  }

  serializeForMsw(): SerializedFeatureFlagAppModel {
    return {
      clock: this.clock,
      featureFlags: clone(this.featureFlags),
      pendingErrors: this.errors.snapshot(),
      sequence: this.sequence,
    };
  }

  constructor(seed: FeatureFlagAppModelSeed = {}) {
    // FeatureFlagRecord extends FeatureFlag with audit fields. We validate
    // the API-side shape (FeatureFlag) and rely on the in-memory typing
    // to track the audit fields.
    this.featureFlags = parseContract(
      z.array(zFeatureFlag),
      seed.featureFlags ?? [],
      'FeatureFlagAppModel seed.featureFlags',
    );
    this.sequence = this.featureFlags.length + 1;

    const timestamps = this.featureFlags.flatMap((featureFlag) => [
      Date.parse(featureFlag.createdAt),
      Date.parse(featureFlag.updatedAt),
    ]);
    const latestTimestamp =
      timestamps.length > 0 ? Math.max(...timestamps) : null;

    if (latestTimestamp != null && Number.isFinite(latestTimestamp)) {
      this.clock = latestTimestamp;
    }
  }

  listFeatureFlags(): FeatureFlag[] {
    return clone(this.featureFlags);
  }

  getFeatureFlag(featureFlagSlug: string): FeatureFlag {
    return clone(this.findFeatureFlag(featureFlagSlug));
  }

  createFeatureFlag(body: FeatureFlagWritable): FeatureFlag {
    const input = parseContract(
      zFeatureFlagWritable,
      body,
      'FeatureFlagAppModel.createFeatureFlag body',
    );
    this.errors.consume('create');
    const timestamp = this.nextTimestamp();
    const featureFlag: FeatureFlagRecord = {
      createdAt: timestamp,
      createdBy: DEFAULT_ACTOR,
      default_variant: clone(input.default_variant),
      description: input.description,
      enabled: input.enabled,
      event_name: input.event_name,
      id: `feature-flag-${this.sequence}`,
      metadata: clone(input.metadata ?? {}),
      name: input.name,
      slug: this.createUniqueSlug(input.slug ?? input.name),
      targetings: clone(input.targetings ?? []),
      type: input.type,
      updatedAt: timestamp,
      updatedBy: DEFAULT_ACTOR,
      variants: clone(input.variants ?? null),
    };
    const result = parseContract(
      zFeatureFlag,
      featureFlag,
      'FeatureFlagAppModel.createFeatureFlag result',
    );

    this.sequence += 1;
    this.featureFlags.unshift(result);

    return clone(result);
  }

  updateFeatureFlag(
    featureFlagSlug: string,
    body: FeatureFlagWritable,
  ): FeatureFlag {
    const input = parseContract(
      zFeatureFlagWritable,
      body,
      'FeatureFlagAppModel.updateFeatureFlag body',
    );
    this.errors.consume('update');
    const featureFlagIndex = this.featureFlags.findIndex(
      (featureFlag) => featureFlag.slug === featureFlagSlug,
    );

    if (featureFlagIndex < 0) {
      throw new Error(`Feature flag "${featureFlagSlug}" not found`);
    }

    const currentFeatureFlag = this.featureFlags[featureFlagIndex];
    const nextSlug =
      input.slug && input.slug !== featureFlagSlug
        ? this.createUniqueSlug(input.slug)
        : (currentFeatureFlag.slug ?? featureFlagSlug);
    const updatedFeatureFlag: FeatureFlagRecord = {
      ...currentFeatureFlag,
      default_variant: clone(input.default_variant),
      description: input.description,
      enabled: input.enabled,
      event_name: input.event_name,
      metadata: clone(input.metadata ?? {}),
      name: input.name,
      slug: nextSlug,
      targetings: clone(input.targetings ?? []),
      type: input.type,
      updatedAt: this.nextTimestamp(),
      updatedBy: DEFAULT_ACTOR,
      variants: clone(input.variants ?? null),
    };
    const result = parseContract(
      zFeatureFlag,
      updatedFeatureFlag,
      'FeatureFlagAppModel.updateFeatureFlag result',
    );

    this.featureFlags[featureFlagIndex] = result;

    return clone(result);
  }

  deleteFeatureFlag(featureFlagSlug: string) {
    this.errors.consume('delete');
    const featureFlagIndex = this.featureFlags.findIndex(
      (featureFlag) => featureFlag.slug === featureFlagSlug,
    );

    if (featureFlagIndex < 0) {
      throw new Error(`Feature flag "${featureFlagSlug}" not found`);
    }

    this.featureFlags.splice(featureFlagIndex, 1);
  }

  evaluateFlag(
    featureFlagSlug: string,
    context: Record<string, unknown>,
  ): EvaluationSuccess {
    this.errors.consume('evaluate');
    const featureFlag = this.findFeatureFlag(featureFlagSlug);
    const targetingKey =
      typeof context.targetingKey === 'string' &&
      context.targetingKey.length > 0
        ? context.targetingKey
        : 'anonymous';

    if (featureFlag.enabled) {
      for (const targeting of featureFlag.targetings ?? []) {
        if (!this.matchesRule(targeting.rule, context)) {
          continue;
        }

        if (targeting.type === 'basic') {
          return this.buildVariantEvaluation(
            featureFlag,
            targeting.variant,
            'TARGETING_MATCH',
          );
        }

        if (targeting.type === 'rollout_percentage') {
          const variantName = this.resolveDistribution(
            targeting.distribution,
            targetingKey,
          );

          return this.buildVariantEvaluation(
            featureFlag,
            variantName,
            'TARGETING_MATCH',
          );
        }

        if (targeting.type === 'rollout_date') {
          const variantName = this.resolveRolloutDateVariant(
            targeting,
            context,
          );

          return this.buildVariantEvaluation(
            featureFlag,
            variantName,
            'TARGETING_MATCH',
          );
        }
      }
    }

    return this.resolveDefaultVariant(featureFlag, targetingKey, context);
  }

  private buildVariantEvaluation(
    featureFlag: FeatureFlagRecord,
    variantName: string,
    reason: string,
  ): EvaluationSuccess {
    const variant = this.findVariant(featureFlag, variantName);
    const evaluation: EvaluationSuccess = {
      key: featureFlag.slug ?? featureFlag.name,
      metadata: clone(featureFlag.metadata),
      reason,
      value: clone(variant?.value),
      variant: variant?.name ?? variantName,
    };

    return parseContract(
      zEvaluationSuccess,
      evaluation,
      'FeatureFlagAppModel.evaluateFlag result',
    );
  }

  private createUniqueSlug(value: string) {
    const baseSlug = slugify(value) || `feature-flag-${this.sequence}`;

    if (
      !this.featureFlags.some((featureFlag) => featureFlag.slug === baseSlug)
    ) {
      return baseSlug;
    }

    let suffix = 2;
    while (
      this.featureFlags.some(
        (featureFlag) => featureFlag.slug === `${baseSlug}-${suffix}`,
      )
    ) {
      suffix += 1;
    }

    return `${baseSlug}-${suffix}`;
  }

  private evaluatePredicate(
    predicate: string,
    context: Record<string, unknown>,
  ) {
    const trimmedPredicate = predicate.trim();

    if (!trimmedPredicate) {
      return true;
    }

    const stringComparison = trimmedPredicate.match(
      /^context\.([a-zA-Z0-9_]+)\s*==\s*"([^"]*)"$/,
    );

    if (stringComparison) {
      const [, key, expected] = stringComparison;
      return normalizeContextValue(context[key]) === expected;
    }

    const startsWithComparison = trimmedPredicate.match(
      /^context\.([a-zA-Z0-9_]+)\.startsWith\("([^"]*)"\)$/,
    );

    if (startsWithComparison) {
      const [, key, expectedPrefix] = startsWithComparison;
      return (
        typeof context[key] === 'string' &&
        context[key].startsWith(expectedPrefix)
      );
    }

    const booleanComparison = trimmedPredicate.match(
      /^context\.([a-zA-Z0-9_]+)\s*==\s*(true|false)$/,
    );

    if (booleanComparison) {
      const [, key, expected] = booleanComparison;
      return context[key] === (expected === 'true');
    }

    const numericComparison = trimmedPredicate.match(
      /^context\.([a-zA-Z0-9_]+)\s*==\s*(-?[0-9]+(?:\.[0-9]+)?)$/,
    );

    if (numericComparison) {
      const [, key, expected] = numericComparison;
      return Number(context[key]) === Number(expected);
    }

    return false;
  }

  private findFeatureFlag(featureFlagSlug: string) {
    const featureFlag = this.featureFlags.find(
      (featureFlagEntry) => featureFlagEntry.slug === featureFlagSlug,
    );

    if (!featureFlag) {
      throw new Error(`Feature flag "${featureFlagSlug}" not found`);
    }

    return featureFlag;
  }

  private findVariant(featureFlag: FeatureFlagRecord, variantName: string) {
    return featureFlag.variants?.find(
      (variant) => variant.name === variantName,
    );
  }

  private hash(value: string) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) % 101;
    }

    return hash;
  }

  private matchesRule(rule: string, context: Record<string, unknown>) {
    return rule
      .split('&&')
      .map((predicate) => predicate.trim())
      .every((predicate) => this.evaluatePredicate(predicate, context));
  }

  private nextTimestamp() {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }

  private resolveDefaultVariant(
    featureFlag: FeatureFlagRecord,
    targetingKey: string,
    context: Record<string, unknown>,
  ) {
    if (featureFlag.default_variant.type === 'basic') {
      return this.buildVariantEvaluation(
        featureFlag,
        featureFlag.default_variant.value,
        featureFlag.enabled ? 'DEFAULT' : 'DISABLED',
      );
    }

    if (featureFlag.default_variant.type === 'rollout_percentage') {
      const variantName = this.resolveDistribution(
        featureFlag.default_variant.distribution,
        targetingKey,
      );

      return this.buildVariantEvaluation(
        featureFlag,
        variantName,
        featureFlag.enabled ? 'DEFAULT' : 'DISABLED',
      );
    }

    const variantName = this.resolveRolloutDateVariant(
      featureFlag.default_variant,
      context,
    );

    return this.buildVariantEvaluation(
      featureFlag,
      variantName,
      featureFlag.enabled ? 'DEFAULT' : 'DISABLED',
    );
  }

  private resolveDistribution(
    distribution: Record<string, number>,
    targetingKey: string,
  ) {
    const bucket = this.hash(targetingKey) % 100;
    let cursor = 0;

    for (const [variantName, percentage] of Object.entries(distribution)) {
      cursor += percentage;

      if (bucket < cursor) {
        return variantName;
      }
    }

    return Object.keys(distribution)[0] ?? '';
  }

  private resolveRolloutDateVariant(
    rollout: RolloutDateLike,
    context: Record<string, unknown>,
  ) {
    const nowSource =
      typeof context.now === 'string' ? Date.parse(context.now) : Date.now();
    const endDate = Date.parse(rollout.end.date);

    if (Number.isFinite(endDate) && nowSource >= endDate) {
      return rollout.end.variant;
    }

    return rollout.start.variant;
  }
}
