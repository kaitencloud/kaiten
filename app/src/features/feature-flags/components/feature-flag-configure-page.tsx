import type { FeatureFlag } from '@/api-client';
import { FeatureFlagForm } from './feature-flag-form';

type FeatureFlagConfigurePageProps = {
  featureFlag: FeatureFlag;
};

export function FeatureFlagConfigurePage({
  featureFlag,
}: FeatureFlagConfigurePageProps) {
  return <FeatureFlagForm featureFlag={featureFlag} />;
}
