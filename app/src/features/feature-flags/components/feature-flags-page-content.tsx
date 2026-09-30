import { useTranslation } from 'react-i18next';
import type { FeatureFlag } from '@/api-client';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { FeatureFlagList } from './feature-flag-list';
import { FeatureFlagStatsCards } from './feature-flag-stats-cards';

type FeatureFlagsPageContentProps = {
  featureFlags: FeatureFlag[];
  viewMode: 'list' | 'table';
  onViewModeChange: (nextView: 'list' | 'table') => void;
};

export function FeatureFlagsPageContent({
  featureFlags,
  viewMode,
  onViewModeChange,
}: FeatureFlagsPageContentProps) {
  const { t } = useTranslation();
  const FeatureFlagIcon = dataModelIcons.featureFlag;

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <FeatureFlagIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t('Pages.FeatureFlags.title')}</Page.Title>
            <Page.Subtitle>{t('Pages.FeatureFlags.subtitle')}</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>
      <div className="mt-6 shrink-0">
        <FeatureFlagStatsCards featureFlags={featureFlags} />
      </div>
      <div className="flex-1 min-h-0">
        <FeatureFlagList
          featureFlags={featureFlags}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      </div>
    </Page>
  );
}
