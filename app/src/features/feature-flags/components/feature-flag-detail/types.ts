import type { ReactNode } from 'react';
import type { FeatureFlag } from '@/api-client';

export type FeatureFlagDetailPageContentProps = {
  children: ReactNode;
  featureFlag: FeatureFlag;
  featureFlagSlug: string;
};

export type FeatureFlagAuditFields = FeatureFlag & {
  createdAt?: string;
  createdBy?: unknown;
  created_at?: string;
  created_by?: unknown;
  updatedAt?: string;
  updatedBy?: unknown;
  updated_at?: string;
  updated_by?: unknown;
};

export type FeatureFlagVariant = NonNullable<FeatureFlag['variants']>[number];
export type FeatureFlagTargeting = NonNullable<
  FeatureFlag['targetings']
>[number];

export type EvaluationSample = {
  context: Record<string, unknown>;
  id: string;
  reason: string;
  value: unknown;
  variant: string;
};

export type FeatureFlagDetailContextValue = {
  createdAt?: string;
  createdByName: string;
  defaultDistributionTotal: number | null;
  distinctVariantsCount: number;
  eventName: string;
  featureFlag: FeatureFlag;
  locale: string;
  owner: string;
  sampleEvaluations: EvaluationSample[];
  targetings: FeatureFlagTargeting[];
  updatedAt?: string;
  updatedByName: string;
  variantMap: Map<string, FeatureFlagVariant>;
  variants: FeatureFlagVariant[];
};
