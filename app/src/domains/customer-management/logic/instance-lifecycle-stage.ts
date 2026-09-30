import type { TFunction } from 'i18next';

// Suggested commercial lifecycle stages. The field is free-form: the vendor
// may store any non-empty string, but these four get first-class labels and a
// distinct visual treatment.
export const LIFECYCLE_STAGE_DEFAULTS = [
  'TRIAL',
  'ACTIVE',
  'AT_RISK',
  'CHURNED',
] as const;

export type DefaultLifecycleStage = (typeof LIFECYCLE_STAGE_DEFAULTS)[number];

const STAGE_LABEL_KEYS = {
  TRIAL: 'Pages.Customers.Instances.Detail.lifecycleStage.trial',
  ACTIVE: 'Pages.Customers.Instances.Detail.lifecycleStage.active',
  AT_RISK: 'Pages.Customers.Instances.Detail.lifecycleStage.atRisk',
  CHURNED: 'Pages.Customers.Instances.Detail.lifecycleStage.churned',
} satisfies Record<DefaultLifecycleStage, string>;

const STAGE_FALLBACK_LABELS = {
  TRIAL: 'Trial',
  ACTIVE: 'Active',
  AT_RISK: 'At risk',
  CHURNED: 'Churned',
} satisfies Record<DefaultLifecycleStage, string>;

export const isDefaultLifecycleStage = (
  stage: string,
): stage is DefaultLifecycleStage =>
  (LIFECYCLE_STAGE_DEFAULTS as readonly string[]).includes(stage);

export const getLifecycleStageLabel = (t: TFunction, stage: string): string =>
  isDefaultLifecycleStage(stage)
    ? t(STAGE_LABEL_KEYS[stage], STAGE_FALLBACK_LABELS[stage])
    : stage;

// Suggestions surfaced by the creatable combobox on the detail view.
export const getLifecycleStageSuggestions = (t: TFunction) =>
  LIFECYCLE_STAGE_DEFAULTS.map((stage) => ({
    label: getLifecycleStageLabel(t, stage),
    value: stage,
  }));
