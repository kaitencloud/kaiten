import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import type { EvaluationSuccess } from '@/api-client';
import { getAuditDisplayName } from '@/lib/detail';
import type {
  EvaluationSample,
  FeatureFlagAuditFields,
  FeatureFlagDetailContextValue,
  FeatureFlagDetailPageContentProps,
  FeatureFlagTargeting,
  FeatureFlagVariant,
} from './types';

type UseFeatureFlagDetailContextValueResult = {
  contextValue: FeatureFlagDetailContextValue;
  handleEvaluationSample: (payload: {
    context: Record<string, unknown>;
    result: EvaluationSuccess;
  }) => void;
  sampleEvaluations: EvaluationSample[];
};

function buildFallbackLabel(featureFlagAudit: FeatureFlagAuditFields) {
  return getAuditDisplayName({
    actor: featureFlagAudit.createdBy ?? featureFlagAudit.created_by,
  });
}

export function useFeatureFlagDetailContextValue(
  featureFlag: FeatureFlagDetailPageContentProps['featureFlag'],
  locale: string,
  t: TFunction,
): UseFeatureFlagDetailContextValueResult {
  const [sampleEvaluations, setSampleEvaluations] = useState<
    EvaluationSample[]
  >([]);
  const featureFlagAudit = featureFlag as FeatureFlagAuditFields;
  const variants: FeatureFlagVariant[] = useMemo(
    () => featureFlag.variants ?? [],
    [featureFlag.variants],
  );
  const targetings: FeatureFlagTargeting[] = useMemo(
    () => featureFlag.targetings ?? [],
    [featureFlag.targetings],
  );
  const createdAt = featureFlagAudit.createdAt ?? featureFlagAudit.created_at;
  const updatedAt = featureFlagAudit.updatedAt ?? featureFlagAudit.updated_at;
  const createdByName = buildFallbackLabel(featureFlagAudit);
  const updatedByName = getAuditDisplayName({
    actor: featureFlagAudit.updatedBy ?? featureFlagAudit.updated_by,
  });
  const owner =
    typeof featureFlag.metadata.owner === 'string'
      ? featureFlag.metadata.owner
      : t('Pages.FeatureFlags.Detail.fallback.notAvailable');
  const eventName =
    typeof featureFlag.event_name === 'string' &&
    featureFlag.event_name.trim().length > 0
      ? featureFlag.event_name
      : t('Pages.FeatureFlags.Detail.fallback.notAvailable');
  const variantMap = useMemo(
    () => new Map(variants.map((variant) => [variant.name, variant])),
    [variants],
  );
  const defaultDistributionTotal =
    featureFlag.default_variant.type === 'rollout_percentage'
      ? Object.values(featureFlag.default_variant.distribution).reduce(
          (acc, curr) => acc + curr,
          0,
        )
      : null;
  const distinctVariantsCount = new Set(
    sampleEvaluations.map((evaluation) => evaluation.variant),
  ).size;

  function handleEvaluationSample({
    context,
    result,
  }: {
    context: Record<string, unknown>;
    result: EvaluationSuccess;
  }) {
    setSampleEvaluations((previousSamples) => {
      const nextSample: EvaluationSample = {
        context,
        id: `${Date.now()}-${previousSamples.length + 1}`,
        reason:
          result.reason ?? t('Pages.FeatureFlags.Detail.fallback.notAvailable'),
        value: result.value,
        variant:
          result.variant ??
          t('Pages.FeatureFlags.Detail.fallback.notAvailable'),
      };

      return [nextSample, ...previousSamples].slice(0, 10);
    });
  }

  const contextValue = useMemo<FeatureFlagDetailContextValue>(
    () => ({
      createdAt,
      createdByName,
      defaultDistributionTotal,
      distinctVariantsCount,
      eventName,
      featureFlag,
      locale,
      owner,
      sampleEvaluations,
      targetings,
      updatedAt,
      updatedByName,
      variantMap,
      variants,
    }),
    [
      createdAt,
      createdByName,
      defaultDistributionTotal,
      distinctVariantsCount,
      eventName,
      featureFlag,
      locale,
      owner,
      sampleEvaluations,
      targetings,
      updatedAt,
      updatedByName,
      variantMap,
      variants,
    ],
  );

  return {
    contextValue,
    handleEvaluationSample,
    sampleEvaluations,
  };
}
