import type { FeatureFlagDetailPageContentProps } from './types';

export function buildFeatureFlagDetailTabs(
  featureFlagSlug: FeatureFlagDetailPageContentProps['featureFlagSlug'],
) {
  return [
    {
      labelKey: 'Pages.FeatureFlags.Detail.tabs.overview',
      params: { featureFlagSlug },
      to: '/feature-flags/$featureFlagSlug',
      value: 'overview',
    },
    {
      labelKey: 'Pages.FeatureFlags.Detail.tabs.variants',
      params: { featureFlagSlug },
      to: '/feature-flags/$featureFlagSlug/variants',
      value: 'variants',
    },
    {
      labelKey: 'Pages.FeatureFlags.Detail.tabs.targeting',
      params: { featureFlagSlug },
      to: '/feature-flags/$featureFlagSlug/targeting',
      value: 'targeting',
    },
    {
      labelKey: 'Pages.FeatureFlags.Detail.tabs.evaluation',
      params: { featureFlagSlug },
      to: '/feature-flags/$featureFlagSlug/evaluation',
      value: 'evaluation',
    },
  ];
}
